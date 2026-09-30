//! Gapless playback metadata parsing and sample trimming for the Nora Native Audio Engine.
//!
//! Extracts encoder delay and padding frames from MP3 LAME/Xing tags and Apple M4A/MP3
//! `iTunSMPB` metadata atoms, applying frame-accurate trimming prior to mixing/resampling.

use serde::{Deserialize, Serialize};

/// Policy controlling gapless trimming behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GaplessMode {
    /// Apply metadata-specified delay/padding when present; otherwise pass
    /// audio through untouched. (Symphonia already compensates MP3
    /// delay/padding via `enable_gapless`, so no extra heuristic is applied
    /// here to avoid double-trimming.)
    #[default]
    Auto,
    /// Strictly apply metadata-specified delay and padding; no heuristics.
    Metadata,
    /// Disable gapless trimming entirely (e.g. for debugging or raw bitstream testing).
    Off,
}

/// Extracted gapless playback properties for an audio stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct GaplessInfo {
    /// Number of encoder-introduced padding frames at the start of the audio stream.
    pub encoder_delay: u64,
    /// Number of encoder-introduced padding frames at the end of the audio stream.
    pub encoder_padding: u64,
    /// Exact count of original PCM audio frames (excluding delay and padding).
    pub valid_frames: Option<u64>,
}

impl GaplessInfo {
    pub const fn new(encoder_delay: u64, encoder_padding: u64, valid_frames: Option<u64>) -> Self {
        Self {
            encoder_delay,
            encoder_padding,
            valid_frames,
        }
    }

    /// Check if any trimming is required.
    pub const fn has_trimming(&self) -> bool {
        self.encoder_delay > 0 || self.encoder_padding > 0 || self.valid_frames.is_some()
    }
}

/// Parse an Apple `iTunSMPB` metadata comment string.
///
/// Format: 12 hexadecimal tokens separated by whitespace:
/// `00000000 aaaaaaaa bbbbbbbb cccccccccccccccc ...`
/// - Token 1: 0 (unused / dummy)
/// - Token 2: Encoder delay frames (hex u32)
/// - Token 3: End padding frames (hex u32)
/// - Token 4: Total valid audio frames (hex u64)
pub fn parse_itunsmpb(s: &str) -> Option<GaplessInfo> {
    let tokens: Vec<&str> = s.split_whitespace().collect();
    if tokens.len() < 4 {
        return None;
    }

    // Strict: a corrupt delay/padding token must reject the whole tag rather
    // than trim from a wrong offset; valid_frames alone cannot locate audio.
    let delay = u64::from_str_radix(tokens[1], 16).ok()?;
    let padding = u64::from_str_radix(tokens[2], 16).ok()?;
    let valid_frames = u64::from_str_radix(tokens[3], 16).ok();

    Some(GaplessInfo {
        encoder_delay: delay,
        encoder_padding: padding,
        valid_frames,
    })
}

/// Parse an MP3 LAME / Xing tag buffer to extract encoder delay and padding.
///
/// LAME encodes 12 bits of delay and 12 bits of padding into 3 bytes following the
/// 9-byte LAME version string:
/// `[delay: 12 bits][padding: 12 bits]`
pub fn parse_lame_tag(data: &[u8]) -> Option<GaplessInfo> {
    // Search for "Xing" or "Info" magic
    let xing_pos = data.windows(4).position(|w| w == b"Xing" || w == b"Info")?;

    // LAME header typically follows 120 bytes into the Xing frame or 128 bytes after Xing tag.
    // Specifically, search for "LAME" or "Lavf" signature within the packet window.
    if let Some(lame_offset) = data[xing_pos..].windows(4).position(|w| w == b"LAME" || w == b"Lavc") {
        let abs_pos = xing_pos + lame_offset;
        // Delay/padding live 21 bytes past the tag start (4-byte tag + 9-byte
        // version string + 8 bytes of revision/VBR/filter fields), not
        // immediately after the version string.
        // Byte 21: delay high 8 bits
        // Byte 22: (delay low 4 bits << 4) | (padding high 4 bits)
        // Byte 23: padding low 8 bits
        const DELAY_OFFSET: usize = 21;
        if abs_pos + DELAY_OFFSET + 3 <= data.len() {
            let b0 = data[abs_pos + DELAY_OFFSET] as u64;
            let b1 = data[abs_pos + DELAY_OFFSET + 1] as u64;
            let b2 = data[abs_pos + DELAY_OFFSET + 2] as u64;

            let delay = (b0 << 4) | (b1 >> 4);
            let padding = ((b1 & 0x0F) << 8) | b2;

            // Sanity: MP3 encoder delay is ~2112 frames; reject garbage that
            // would otherwise mute whole tracks.
            if delay > 10_000 || padding > 10_000 {
                return None;
            }

            return Some(GaplessInfo {
                encoder_delay: delay,
                encoder_padding: padding,
                valid_frames: None,
            });
        }
    }

    None
}

/// Stream trimmer that drops leading encoder delay and caps playback to valid frames.
#[derive(Debug, Clone)]
pub struct GaplessTrimmer {
    channels: usize,
    delay_samples_remaining: usize,
    valid_samples_remaining: Option<u64>,
    mode: GaplessMode,
}

impl GaplessTrimmer {
    /// Create a new trimmer for the specified audio spec and gapless info.
    pub fn new(channels: u16, info: GaplessInfo, mode: GaplessMode) -> Self {
        let ch = channels.max(1) as usize;
        let (delay_samples, valid_samples) = match mode {
            GaplessMode::Off => (0, None),
            GaplessMode::Metadata | GaplessMode::Auto => {
                // Clamp absurd budgets from corrupt tags so a bad header can
                // never mute an entire file with perpetual empty slices.
                let delay_frames = (info.encoder_delay as usize).min(10_000);
                let delay_s = delay_frames.saturating_mul(ch);
                let valid_s = info.valid_frames.map(|f| f.saturating_mul(ch as u64));
                (delay_s, valid_s)
            }
        };

        Self {
            channels: ch,
            delay_samples_remaining: delay_samples,
            valid_samples_remaining: valid_samples,
            mode,
        }
    }

    /// Process a chunk of interleaved audio samples, trimming leading delay and capping valid samples.
    ///
    /// Modifies `samples` in-place or returns a trimmed slice.
    pub fn trim_interleaved<'a>(&mut self, samples: &'a [f32]) -> &'a [f32] {
        if self.mode == GaplessMode::Off || samples.is_empty() {
            return samples;
        }

        let mut start_idx = 0;

        // 1. Drop leading delay
        if self.delay_samples_remaining > 0 {
            let to_drop = self.delay_samples_remaining.min(samples.len());
            // Align to multi-channel frame boundary
            let aligned_drop = (to_drop / self.channels) * self.channels;
            self.delay_samples_remaining = self.delay_samples_remaining.saturating_sub(aligned_drop);
            start_idx = aligned_drop;
        }

        if start_idx >= samples.len() {
            return &[];
        }

        let available = &samples[start_idx..];

        // 2. Cap to valid samples if specified
        if let Some(ref mut remaining) = self.valid_samples_remaining {
            if *remaining == 0 {
                return &[];
            }
            let take = (*remaining).min(available.len() as u64) as usize;
            let aligned_take = (take / self.channels) * self.channels;
            if aligned_take == 0 && take > 0 {
                // Remainder smaller than one frame (e.g. remaining == 1 sample
                // with stereo): consume it now instead of spinning forever
                // returning empty slices with a never-exhausting budget.
                *remaining = 0;
                return &[];
            }
            *remaining = remaining.saturating_sub(aligned_take as u64);
            // Guard against corrupt-huge delay budgets that would otherwise
            // emit empty slices to end-of-file with no EOS signal.
            if aligned_take == 0 {
                *remaining = 0;
                return &[];
            }
            &available[..aligned_take]
        } else {
            available
        }
    }

    /// Returns true if the configured valid frame budget has been exhausted.
    pub fn is_exhausted(&self) -> bool {
        self.valid_samples_remaining.is_some_and(|r| r == 0)
    }
}
