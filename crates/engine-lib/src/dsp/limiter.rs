//! 5ms Lookahead Peak Safety Limiter for the Nora Native Audio Engine.
//!
//! Applies a circular lookahead delay line to detect incoming signal transients ahead of time,
//! smoothly attenuating peaks to prevent digital inter-sample clipping while maintaining transparency.

/// Maximum supported lookahead frames (supports up to 192kHz * 0.005s = 960 frames).
const MAX_LOOKAHEAD_FRAMES: usize = 1024;
const MAX_LOOKAHEAD_SAMPLES: usize = MAX_LOOKAHEAD_FRAMES * 2;

/// Peak limiter with configurable lookahead duration and smooth attack/release envelopes.
#[derive(Debug, Clone)]
pub struct PeakLimiter {
    enabled: bool,
    sample_rate: f32,
    lookahead_frames: usize,
    delay_buffer: [f32; MAX_LOOKAHEAD_SAMPLES],
    write_pos: usize,
    gain: f32,
    threshold: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl Default for PeakLimiter {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl PeakLimiter {
    /// Create a new 5ms lookahead peak limiter for the specified sample rate.
    pub fn new(sample_rate: f32) -> Self {
        let mut limiter = Self {
            enabled: true,
            sample_rate: sample_rate.max(8000.0),
            lookahead_frames: 240, // default 5ms at 48kHz
            delay_buffer: [0.0; MAX_LOOKAHEAD_SAMPLES],
            write_pos: 0,
            gain: 1.0,
            threshold: 0.99, // -0.08 dB headroom threshold
            attack_coeff: 0.0,
            release_coeff: 0.0,
        };
        limiter.recalculate();
        limiter
    }

    /// Enable or disable the peak limiter.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            self.gain = 1.0;
        }
    }

    /// Return whether the limiter is enabled.
    #[inline]
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Update sample rate and recalculate lookahead frame window and smoothing coefficients.
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
        self.recalculate();
    }

    fn recalculate(&mut self) {
        // 5ms lookahead = 0.005 * sample_rate
        let frames = ((0.005 * self.sample_rate).round() as usize).clamp(1, MAX_LOOKAHEAD_FRAMES);
        self.lookahead_frames = frames;

        // 2ms attack, 50ms release
        let attack_time_sec = 0.002f32;
        let release_time_sec = 0.050f32;
        self.attack_coeff = (-1.0 / (attack_time_sec * self.sample_rate)).exp();
        self.release_coeff = (-1.0 / (release_time_sec * self.sample_rate)).exp();
    }

    /// Process interleaved stereo f32 samples through the lookahead delay buffer.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        let delay_samples = self.lookahead_frames * 2;

        for chunk in samples.chunks_exact_mut(2) {
            let in_l = chunk[0];
            let in_r = chunk[1];

            // 1. Detect instantaneous peak magnitude
            let peak = in_l.abs().max(in_r.abs());

            // 2. Compute target gain reduction
            let target_gain = if peak > self.threshold {
                self.threshold / peak
            } else {
                1.0
            };

            // 3. Smooth envelope tracking (fast attack, slow release)
            if target_gain < self.gain {
                self.gain = self.attack_coeff * self.gain + (1.0 - self.attack_coeff) * target_gain;
            } else {
                self.gain = self.release_coeff * self.gain + (1.0 - self.release_coeff) * target_gain;
            }

            // 4. Retrieve delayed samples from circular lookahead buffer
            let read_pos = (self.write_pos + MAX_LOOKAHEAD_SAMPLES - delay_samples) % MAX_LOOKAHEAD_SAMPLES;
            let delayed_l = self.delay_buffer[read_pos];
            let delayed_r = self.delay_buffer[read_pos + 1];

            // 5. Store current input into circular lookahead buffer
            self.delay_buffer[self.write_pos] = in_l;
            self.delay_buffer[self.write_pos + 1] = in_r;
            self.write_pos = (self.write_pos + 2) % MAX_LOOKAHEAD_SAMPLES;

            // 6. Apply gain reduction and output limited samples (hard-clamped to [-1.0, 1.0])
            chunk[0] = (delayed_l * self.gain).clamp(-1.0, 1.0);
            chunk[1] = (delayed_r * self.gain).clamp(-1.0, 1.0);
        }
    }

    /// Reset internal state and flush delay lines.
    pub fn reset_state(&mut self) {
        self.delay_buffer = [0.0; MAX_LOOKAHEAD_SAMPLES];
        self.write_pos = 0;
        self.gain = 1.0;
    }
}
