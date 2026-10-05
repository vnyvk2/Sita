//! Complete audio decoding pipeline managing packet streaming, planar-to-interleaved
//! f32 conversion, mono-to-stereo expansion, and seek operations.

use std::path::Path;

use symphonia::core::audio::{SampleBuffer, SignalSpec};
use symphonia::core::codecs::Decoder;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatReader, SeekMode, SeekTo};
use symphonia::core::units::Time;

use crate::decoder::probe::{probe_file, ProbedSource};
use crate::types::{AudioSpec, DecodeError};

/// Audio decoding pipeline converting compressed bitstreams into normalized interleaved f32 samples.
pub struct DecoderPipeline {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    spec: AudioSpec,
    sample_buf: Option<SampleBuffer<f32>>,
    signal_spec: Option<SignalSpec>,
    staging_buffer: Vec<f32>,
    is_source_mono: bool,
    total_frames: Option<u64>,
    frames_decoded: u64,
    is_eos: bool,
}

impl DecoderPipeline {
    /// Open an audio file and initialize the decoding pipeline.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, DecodeError> {
        let probed = probe_file(path)?;
        Self::from_probed(probed)
    }

    /// Construct a pipeline from an existing ProbedSource.
    pub fn from_probed(probed: ProbedSource) -> Result<Self, DecodeError> {
        // Check if the original track was mono
        let track = probed
            .format
            .tracks()
            .iter()
            .find(|t| t.id == probed.track_id)
            .ok_or(DecodeError::NoAudioTrack)?;

        let is_source_mono = track.codec_params.channels.is_some_and(|c| c.count() == 1);

        Ok(Self {
            format: probed.format,
            decoder: probed.decoder,
            track_id: probed.track_id,
            spec: probed.spec,
            sample_buf: None,
            signal_spec: None,
            staging_buffer: Vec::with_capacity(8192),
            is_source_mono,
            total_frames: probed.total_frames,
            frames_decoded: 0,
            is_eos: false,
        })
    }

    /// Return the negotiated audio specification (always Stereo F32).
    #[inline]
    pub fn spec(&self) -> AudioSpec {
        self.spec
    }

    /// Return total track frames if known.
    #[inline]
    pub fn total_frames(&self) -> Option<u64> {
        self.total_frames
    }

    /// Return total frames decoded so far across this stream.
    #[inline]
    pub fn frames_decoded(&self) -> u64 {
        self.frames_decoded
    }

    /// Returns true if the end of stream has been reached.
    #[inline]
    pub fn is_eos(&self) -> bool {
        self.is_eos
    }

    /// Decode the next packet from the container.
    ///
    /// Returns:
    /// - `Ok(Some(&[f32]))`: Slice of interleaved stereo f32 samples.
    /// - `Ok(None)`: End of stream (EOS) cleanly reached.
    /// - `Err(DecodeError)`: Fatal decode error or profile rejection.
    pub fn decode_next(&mut self) -> Result<Option<&[f32]>, DecodeError> {
        if self.is_eos {
            return Ok(None);
        }

        loop {
            let packet = match self.format.next_packet() {
                Ok(packet) => packet,
                Err(SymphoniaError::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    self.is_eos = true;
                    return Ok(None);
                }
                Err(SymphoniaError::ResetRequired) => {
                    self.decoder.reset();
                    continue;
                }
                Err(e) => {
                    // Transient container glitch: report but keep the pipeline
                    // usable so the caller can continue or seek; only clean
                    // EOF sets is_eos.
                    return Err(DecodeError::PacketDecodeFailed(e.to_string()));
                }
            };

            // Filter for primary track
            if packet.track_id() != self.track_id {
                continue;
            }

            // Decode packet to AudioBufferRef
            let decoded = match self.decoder.decode(&packet) {
                Ok(buf) => buf,
                Err(SymphoniaError::DecodeError(msg)) => {
                    let msg_lower = msg.to_lowercase();
                    if msg_lower.contains("sbr")
                        || msg_lower.contains("parametric")
                        || msg_lower.contains("unsupported profile")
                    {
                        return Err(DecodeError::UnsupportedProfile(format!(
                            "Unsupported AAC profile rejected during decode: {}",
                            msg
                        )));
                    }
                    // Non-fatal packet decode glitch: log and continue to next packet
                    log::warn!("Recoverable packet decode failure: {}", msg);
                    continue;
                }
                Err(SymphoniaError::ResetRequired) => {
                    self.decoder.reset();
                    continue;
                }
                Err(e) => {
                    return Err(DecodeError::PacketDecodeFailed(e.to_string()));
                }
            };

            // Initialize or re-allocate SampleBuffer if format spec changed
            let spec = *decoded.spec();
            if self.signal_spec != Some(spec) {
                // Mid-stream channel changes are unsupported downstream (mixer
                // and DSP assume stereo pairs); reject instead of misreading
                // 5.1 as stereo.
                let ch_count = spec.channels.count();
                if ch_count != 1 && ch_count != 2 {
                    return Err(DecodeError::UnsupportedFormat(format!(
                        "Unsupported mid-stream channel count: {}",
                        ch_count
                    )));
                }
                self.sample_buf = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
                self.signal_spec = Some(spec);
                // Track mono/stereo flips mid-stream, not just at probe time.
                self.is_source_mono = ch_count == 1;
            }

            let is_mono = self.is_source_mono;
            let sample_buf = self.sample_buf.as_mut().ok_or_else(|| {
                DecodeError::PacketDecodeFailed("Sample buffer not initialized".to_string())
            })?;
            sample_buf.copy_interleaved_ref(decoded);
            let raw_samples = sample_buf.samples();

            if raw_samples.is_empty() {
                continue;
            }

            self.staging_buffer.clear();
            if is_mono {
                // Expand Mono to Stereo: L = M, R = M
                self.staging_buffer.reserve(raw_samples.len() * 2);
                for &m in raw_samples {
                    self.staging_buffer.push(m);
                    self.staging_buffer.push(m);
                }
            } else {
                self.staging_buffer.extend_from_slice(raw_samples);
            }

            let frames = (self.staging_buffer.len() / 2) as u64;
            self.frames_decoded += frames;
            return Ok(Some(&self.staging_buffer));
        }
    }

    /// Reposition the decoder to a target timestamp in seconds.
    pub fn seek(&mut self, target_seconds: f64) -> Result<u64, DecodeError> {
        let time = Time::from(target_seconds);
        let seek_to = SeekTo::Time {
            time,
            track_id: Some(self.track_id),
        };

        match self.format.seek(SeekMode::Accurate, seek_to) {
            Ok(_seeked_to) => {
                self.decoder.reset();
                self.is_eos = false;
                // NOTE: `actual_ts` is in the track timebase (e.g. 90kHz
                // ticks), NOT audio frames. Derive frames from wall time and
                // the negotiated sample rate so playhead/duration stay exact.
                let actual_frame = (target_seconds.max(0.0) * self.spec.sample_rate as f64).round() as u64;
                self.frames_decoded = actual_frame;
                Ok(actual_frame)
            }
            Err(e) => Err(DecodeError::SeekFailed(format!(
                "Seek to {:.3}s failed: {}",
                target_seconds, e
            ))),
        }
    }
}
