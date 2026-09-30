//! Digital True-Peak Output Limiter for the Nora Native Audio Engine.
//!
//! Provides strict Digital True-Peak Protection per ITU-R BS.1770-4:
//! - Architecture: Smooth gain envelope with a final per-frame ceiling constraint.
//! - 4x oversampling polyphase FIR detector running exclusively on the sidechain.
//! - Audio path is purely delayed through a circular lookahead buffer (NEVER passed through FIR).
//! - Lookahead horizon peak tracking across the 52-frame window with 5.0ms peak-hold state to eliminate zero-crossing flutter.
//! - Envelope smoothing: Fast attack (tau = 0.25ms, fitting >4 time constants within the 1.08ms lookahead budget) and musical release (tau = 50.0ms).
//! - Per-frame ceiling constraint: Gain applied to the exiting frame is bounded by g[n] <= min(g[n], target_ceiling / p_exiting[n]),
//!   ensuring mathematical peak containment (<= -0.10 dBTP / 0.988553 linear) without relying on audio-path hard clipping.
//! - Under No-Intervention: For a signal that has never caused protection to engage
//!   (or after the limiter has fully settled back to steady-state release) and whose
//!   estimated true peak remains below the threshold, gain remains exactly 1.000000,
//!   preserving mathematical bit-transparency when latency-compensated.
//! - Ceiling threshold: -0.10 dBTP (10^(-0.1/20) approx 0.9885531).
//! - Pipeline latency: 1.0ms lookahead (48 frames at 48kHz) + 4 frames FIR group delay = 52 frames (1.08ms).

/// Maximum supported lookahead frames (supports up to 192kHz * 0.002s = 384 frames).
const MAX_LOOKAHEAD_FRAMES: usize = 512;
const MAX_LOOKAHEAD_SAMPLES: usize = MAX_LOOKAHEAD_FRAMES * 2;

/// Number of active FIR taps per polyphase branch (32 taps total across 4 phases).
pub const POLYPHASE_TAPS: usize = 8;

/// Normalized 4-phase polyphase FIR interpolation filter coefficients (DC sum = 1.0 per phase).
/// Group delay: 16 taps at 4x rate = 4 frames at 1x rate.
pub const POLYPHASE_COEFFS: [[f32; POLYPHASE_TAPS]; 4] = [
    [
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
    ],
    [
        -0.0005766442,
        0.018187608,
        -0.07685424,
        0.274817,
        0.89166665,
        -0.14005053,
        0.04025963,
        -0.0058357944,
    ],
    [
        -0.003461414,
        0.039299594,
        -0.14670727,
        0.61238986,
        0.61238986,
        -0.14670727,
        0.039299594,
        -0.003461414,
    ],
    [
        -0.0058357944,
        0.04025963,
        -0.14005053,
        0.89166665,
        0.274817,
        -0.07685424,
        0.018187608,
        -0.0005766442,
    ],
];

/// Digital True-Peak Limiter with sidechain-only 4x oversampling and lookahead delay.
#[derive(Debug, Clone)]
pub struct TruePeakLimiter {
    enabled: bool,
    sample_rate: f32,
    lookahead_frames: usize,
    fir_group_delay_frames: usize,
    total_delay_frames: usize,
    // Circular lookahead delay buffer for raw audio
    delay_buffer: [f32; MAX_LOOKAHEAD_SAMPLES],
    write_pos: usize,
    // Detector sidechain FIR history (8 past frames for L and R)
    detector_history_l: [f32; POLYPHASE_TAPS],
    detector_history_r: [f32; POLYPHASE_TAPS],
    detector_pos: usize,
    // Lookahead peak buffer and peak-hold state
    peak_buffer: [f32; MAX_LOOKAHEAD_FRAMES],
    peak_write_pos: usize,
    held_peak: f32,
    hold_frames: usize,
    hold_timer: usize,
    // Gain tracking and smoothing
    gain: f32,
    target_ceiling: f32, // -0.10 dBTP (10^(-0.1/20) approx 0.9885531)
    attack_coeff: f32,
    release_coeff: f32,
    // Envelope telemetry
    last_delta_gain: f32,
    max_gain_reduction: f32,
}

impl Default for TruePeakLimiter {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl TruePeakLimiter {
    /// Create a new TruePeakLimiter initialized for the specified sample rate.
    pub fn new(sample_rate: f32) -> Self {
        let mut limiter = Self {
            enabled: true,
            sample_rate: sample_rate.max(8000.0),
            lookahead_frames: 48,
            fir_group_delay_frames: 4,
            total_delay_frames: 52,
            delay_buffer: [0.0; MAX_LOOKAHEAD_SAMPLES],
            write_pos: 0,
            detector_history_l: [0.0; POLYPHASE_TAPS],
            detector_history_r: [0.0; POLYPHASE_TAPS],
            detector_pos: 0,
            peak_buffer: [0.0; MAX_LOOKAHEAD_FRAMES],
            peak_write_pos: 0,
            held_peak: 0.0,
            hold_frames: 240,
            hold_timer: 0,
            gain: 1.0,
            target_ceiling: 0.9885531, // -0.10 dBTP
            attack_coeff: 0.0,
            release_coeff: 0.0,
            last_delta_gain: 0.0,
            max_gain_reduction: 0.0,
        };
        limiter.recalculate();
        limiter
    }

    /// Enable or disable true-peak output protection.
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

    /// Fixed lookahead pipeline latency in audio frames.
    #[inline]
    pub fn latency_frames(&self) -> usize {
        self.total_delay_frames
    }

    /// Current instantaneous gain attenuation factor.
    #[inline]
    pub fn current_gain(&self) -> f32 {
        self.gain
    }

    /// Maximum gain reduction (1.0 - gain) recorded during operation.
    #[inline]
    pub fn max_gain_reduction(&self) -> f32 {
        self.max_gain_reduction
    }

    /// Largest gain delta (|g[n] - g[n-1]|) observed in the last processed buffer.
    #[inline]
    pub fn last_delta_gain(&self) -> f32 {
        self.last_delta_gain
    }

    /// Update sample rate and recalculate delay window and smoothing coefficients.
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
        self.recalculate();
    }

    fn recalculate(&mut self) {
        // Lookahead: 1.0ms = 0.0010 * sample_rate
        let la = ((0.0010 * self.sample_rate).round() as usize).max(1);
        self.lookahead_frames = la;
        self.fir_group_delay_frames = 4; // 16 samples at 4x rate = 4 frames at 1x
        self.total_delay_frames = (la + self.fir_group_delay_frames).min(MAX_LOOKAHEAD_FRAMES);

        // One-pole smoothing: tau_attack = 0.25ms (>= 4.3 time constants in lookahead), tau_release = 50.0ms
        let attack_sec = 0.00025f32;
        let release_sec = 0.0500f32;
        self.attack_coeff = (-1.0 / (attack_sec * self.sample_rate)).exp();
        self.release_coeff = (-1.0 / (release_sec * self.sample_rate)).exp();

        // Peak hold: 5.0ms bridges zero crossings down to 100Hz without carrier ripple
        self.hold_frames = ((0.0050 * self.sample_rate).round() as usize).max(1);
    }

    /// Process interleaved stereo f32 samples in-place.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        let delay_samples = self.total_delay_frames * 2;
        let mut max_delta = 0.0f32;

        for chunk in samples.chunks_exact_mut(2) {
            let in_l = chunk[0];
            let in_r = chunk[1];

            // 1. Push into detector sidechain history buffer (DETECTOR-ONLY)
            self.detector_history_l[self.detector_pos] = in_l;
            self.detector_history_r[self.detector_pos] = in_r;
            self.detector_pos = (self.detector_pos + 1) % POLYPHASE_TAPS;

            // 2. Evaluate 4 polyphase branches for L and R to estimate true peak
            let mut peak_true = in_l.abs().max(in_r.abs());
            for phase_coeffs in &POLYPHASE_COEFFS {
                let mut val_l = 0.0f32;
                let mut val_r = 0.0f32;
                for (k, &coeff) in phase_coeffs.iter().enumerate() {
                    let idx = (self.detector_pos + POLYPHASE_TAPS - 1 - k) % POLYPHASE_TAPS;
                    val_l += coeff * self.detector_history_l[idx];
                    val_r += coeff * self.detector_history_r[idx];
                }
                peak_true = peak_true.max(val_l.abs()).max(val_r.abs());
            }

            // 3. Read true peak of the sample exiting the lookahead delay line NOW
            let exiting_idx = (self.peak_write_pos + MAX_LOOKAHEAD_FRAMES - self.total_delay_frames)
                % MAX_LOOKAHEAD_FRAMES;
            let p_exiting = self.peak_buffer[exiting_idx];

            // 4. Store current frame's true peak into circular peak buffer
            self.peak_buffer[self.peak_write_pos] = peak_true;
            self.peak_write_pos = (self.peak_write_pos + 1) % MAX_LOOKAHEAD_FRAMES;

            // 5. Find maximum peak across all samples currently in the lookahead pipeline
            let mut max_lookahead_peak = 0.0f32;
            for i in 0..self.total_delay_frames {
                let idx = (self.peak_write_pos + MAX_LOOKAHEAD_FRAMES - 1 - i) % MAX_LOOKAHEAD_FRAMES;
                let p = self.peak_buffer[idx];
                if p > max_lookahead_peak {
                    max_lookahead_peak = p;
                }
            }

            // 6. Peak-hold tracking: hold peak across waveform zero crossings
            if max_lookahead_peak >= self.held_peak {
                self.held_peak = max_lookahead_peak;
                self.hold_timer = self.hold_frames;
            } else if self.hold_timer > 0 {
                self.hold_timer -= 1;
            } else {
                self.held_peak = max_lookahead_peak;
            }

            // 7. Compute target gain (No-Intervention when held_peak <= target_ceiling)
            let target_gain = if self.held_peak > self.target_ceiling {
                self.target_ceiling / self.held_peak
            } else {
                1.0
            };

            // 8. Smooth gain envelope with attack and release
            let prev_gain = self.gain;
            if target_gain < self.gain {
                // Attack phase: ramp down smoothly to target gain in advance of peak exit
                self.gain =
                    self.attack_coeff * self.gain + (1.0 - self.attack_coeff) * target_gain;
            } else if self.hold_timer == 0 {
                // Release phase: smooth release after hold timer expires
                self.gain =
                    self.release_coeff * self.gain + (1.0 - self.release_coeff) * target_gain;
            }

            // Strict ceiling guarantee on the frame exiting right now:
            // Ensures gain is unconditionally at or below what this exiting frame requires
            if p_exiting > self.target_ceiling {
                let exiting_max_gain = self.target_ceiling / p_exiting;
                if self.gain > exiting_max_gain {
                    self.gain = exiting_max_gain;
                }
            }

            // Snap cleanly to unity when target is unity and gain is practically 1.0
            if self.gain > 0.99999 && target_gain >= 1.0 && self.held_peak <= self.target_ceiling {
                self.gain = 1.0;
            }

            let delta = (self.gain - prev_gain).abs();
            if delta > max_delta {
                max_delta = delta;
            }
            let red = 1.0 - self.gain;
            if red > self.max_gain_reduction {
                self.max_gain_reduction = red;
            }

            // 9. Read DELAYED raw samples from circular buffer (INVARIANT: NEVER filtered by FIR)
            let read_pos = (self.write_pos + MAX_LOOKAHEAD_SAMPLES - delay_samples)
                % MAX_LOOKAHEAD_SAMPLES;
            let delayed_l = self.delay_buffer[read_pos];
            let delayed_r = self.delay_buffer[read_pos + 1];

            // 10. Store current raw input into circular delay buffer
            self.delay_buffer[self.write_pos] = in_l;
            self.delay_buffer[self.write_pos + 1] = in_r;
            self.write_pos = (self.write_pos + 2) % MAX_LOOKAHEAD_SAMPLES;

            // 11. Modulate delayed raw audio with smooth gain
            // Bounded naturally <= target_ceiling (0.9885531); clamp is purely a DAC safety rail.
            chunk[0] = (delayed_l * self.gain).clamp(-1.0, 1.0);
            chunk[1] = (delayed_r * self.gain).clamp(-1.0, 1.0);
        }

        self.last_delta_gain = max_delta;
    }

    /// Reset internal state and flush delay lines.
    pub fn reset_state(&mut self) {
        self.delay_buffer = [0.0; MAX_LOOKAHEAD_SAMPLES];
        self.write_pos = 0;
        self.detector_history_l = [0.0; POLYPHASE_TAPS];
        self.detector_history_r = [0.0; POLYPHASE_TAPS];
        self.detector_pos = 0;
        self.peak_buffer = [0.0; MAX_LOOKAHEAD_FRAMES];
        self.peak_write_pos = 0;
        self.held_peak = 0.0;
        self.hold_timer = 0;
        self.gain = 1.0;
        self.last_delta_gain = 0.0;
        self.max_gain_reduction = 0.0;
    }

    /// Drain trailing lookahead samples held in the delay line at EOS.
    pub fn flush_tail(&mut self, out: &mut [f32]) -> usize {
        if !self.enabled {
            return 0;
        }
        let delay_samples = self.total_delay_frames * 2;
        let mut written = 0;
        for chunk in out.chunks_exact_mut(2) {
            if written + 2 > delay_samples {
                break;
            }
            let read_pos = (self.write_pos + MAX_LOOKAHEAD_SAMPLES - delay_samples)
                % MAX_LOOKAHEAD_SAMPLES;
            chunk[0] = (self.delay_buffer[read_pos] * self.gain).clamp(-1.0, 1.0);
            chunk[1] = (self.delay_buffer[read_pos + 1] * self.gain).clamp(-1.0, 1.0);
            self.delay_buffer[self.write_pos] = 0.0;
            self.delay_buffer[self.write_pos + 1] = 0.0;
            self.write_pos = (self.write_pos + 2) % MAX_LOOKAHEAD_SAMPLES;
            written += 2;
        }
        written
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_true_peak_limiter_latency_is_52_samples_at_48k() {
        let limiter = TruePeakLimiter::new(48000.0);
        assert_eq!(limiter.latency_frames(), 52, "Latency must be 52 frames at 48kHz (1.08ms)");
    }

    #[test]
    fn test_true_peak_limiter_detector_only_null_below_ceiling() {
        let mut limiter = TruePeakLimiter::new(48000.0);
        let latency = limiter.latency_frames();

        // Feed quiet signal (-3.0 dBFS, below -0.1 dBTP)
        let total_frames = 200;
        let mut input = Vec::with_capacity(total_frames * 2);
        for i in 0..total_frames {
            let t = i as f32 / 48000.0;
            let val = 0.5 * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
            input.push(val);
            input.push(val);
        }

        let mut output = input.clone();
        limiter.process(&mut output);

        // Limiter must never intervene (gain stays 1.000000)
        assert_eq!(limiter.current_gain(), 1.0);
        assert_eq!(limiter.max_gain_reduction(), 0.0);

        // After latency offset, output must be bit-for-bit identical to input!
        for i in latency..total_frames {
            let out_l = output[i * 2];
            let out_r = output[i * 2 + 1];
            let in_l = input[(i - latency) * 2];
            let in_r = input[(i - latency) * 2 + 1];
            assert_eq!(out_l, in_l, "Bit-exact identity required at frame {i}");
            assert_eq!(out_r, in_r, "Bit-exact identity required at frame {i}");
        }
    }

    #[test]
    fn test_true_peak_inter_sample_attenuation() {
        let mut limiter = TruePeakLimiter::new(48000.0);

        // Generate fs/4 sine with offset pi/4 (sample peak = 0.7071, true peak = 1.0000 > 0.98855)
        let total_frames = 500;
        let mut signal = Vec::with_capacity(total_frames * 2);
        for i in 0..total_frames {
            let v = (2.0 * std::f32::consts::PI * 0.25 * i as f32 + std::f32::consts::PI / 4.0).sin();
            signal.push(v);
            signal.push(v);
        }

        limiter.process(&mut signal);

        // Gain must have reduced below 1.0
        assert!(
            limiter.max_gain_reduction() > 0.01,
            "Limiter must attenuate inter-sample true-peak overshoot"
        );
        // Expose measured last_delta_gain
        println!("Measured max delta gain: {}", limiter.last_delta_gain());
    }
}
