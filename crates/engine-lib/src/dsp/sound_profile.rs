//! Nora SoundProfile DSP processor.
//!
//! Provides two presentation profiles:
//! 1. `StudioReference`: Bit-transparent passthrough with zero tonal or dynamic coloration.
//! 2. `VocalNuanceBoost`: Upward nuance shaping contour (primary zero-lookahead architecture per plan):
//!    - Gentle upward lift for quiet details (< -24 dBFS, provisional +2.0 dB).
//!    - Smooth C^1 cubic Hermite transition across mid-levels (-24 dBFS to -12 dBFS).
//!    - Exact unity gain (0.0 dB / 1.000000) for loud material (>= -12 dBFS).
//!    - No downward macro-dynamic compression. Peak crests and loud transients remain untouched.
//!    - Deep silence / noise floor taper below -60 dBFS to -80 dBFS to avoid amplifying background noise.
//!
//! Features:
//! - Primary Prototype Architecture: Zero lookahead (0.00ms added latency), single-stream gain modulation.
//! - 30ms sample-rate-derived smooth S-curve / cosine-squared transition state machine.
//! - Instantaneous reversal protection: Rapid profile toggles smoothly reverse direction
//!   from the current alpha without level jumps or discontinuity.
//! - Lock-free and real-time safe: Zero heap allocations, zero syscalls, zero mutex locks.

use engine_protocol::{SoundProfile, SoundProfileStatus};

/// Transition state machine lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionState {
    StudioReference,
    TransitionToNuance,
    VocalNuanceBoost,
    TransitionToReference,
}

/// Real-time audio thread processor for presentation sound profiles.
pub struct SoundProfileStage {
    sample_rate: f32,
    target_profile: SoundProfile,
    state: TransitionState,
    transition_frame: usize,
    transition_frames: usize,
    current_alpha: f32,
    // VocalNuanceBoost envelope and dynamic contour state
    nuance_envelope: f32,
    nuance_gain: f32,
    attack_coeff: f32,
    release_coeff: f32,
    // Upward Nuance Shaping parameters (zero-lookahead single-stream gain modulation)
    max_lift_db: f32,
    low_threshold_db: f32,
    high_threshold_db: f32,
    noise_gate_db: f32,
    noise_floor_db: f32,
}

impl Default for SoundProfileStage {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl SoundProfileStage {
    /// Create a new SoundProfileStage initialized for the given sample rate.
    pub fn new(sample_rate: f32) -> Self {
        let mut stage = Self {
            sample_rate: sample_rate.max(8000.0),
            target_profile: SoundProfile::StudioReference,
            state: TransitionState::StudioReference,
            transition_frame: 0,
            transition_frames: 1440,
            current_alpha: 0.0,
            nuance_envelope: 0.0,
            nuance_gain: 1.0,
            attack_coeff: 0.0,
            release_coeff: 0.0,
            max_lift_db: 2.0,
            low_threshold_db: -24.0,
            high_threshold_db: -12.0,
            noise_gate_db: -60.0,
            noise_floor_db: -80.0,
        };
        stage.recalculate();
        stage
    }

    /// Access current active profile target.
    #[inline]
    pub fn target_profile(&self) -> SoundProfile {
        self.target_profile
    }

    /// Access instantaneous transition state.
    #[inline]
    pub fn state(&self) -> TransitionState {
        self.state
    }

    /// Access high-level protocol status (Active vs Transitioning).
    #[inline]
    pub fn status(&self) -> SoundProfileStatus {
        match self.state {
            TransitionState::StudioReference | TransitionState::VocalNuanceBoost => {
                SoundProfileStatus::Active
            }
            TransitionState::TransitionToNuance | TransitionState::TransitionToReference => {
                SoundProfileStatus::Transitioning
            }
        }
    }

    /// Current modulation factor alpha in `[0.0, 1.0]`.
    #[inline]
    pub fn current_alpha(&self) -> f32 {
        self.current_alpha
    }

    /// Current internal nuance boost gain factor.
    #[inline]
    pub fn nuance_gain(&self) -> f32 {
        self.nuance_gain
    }

    /// Current internal nuance detector envelope.
    #[inline]
    pub fn nuance_envelope(&self) -> f32 {
        self.nuance_envelope
    }

    /// Transition duration in audio frames.
    #[inline]
    pub fn transition_frames(&self) -> usize {
        self.transition_frames
    }

    /// Update sample rate across rate-dependent parameters.
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
        self.recalculate();
    }

    fn recalculate(&mut self) {
        // Transition frames: 30ms = 0.030 * sample_rate, minimum 64 frames
        self.transition_frames = ((0.030 * self.sample_rate).round() as usize).max(64);

        // VocalNuanceBoost envelope smoothing:
        // Attack: 15ms (natural vocal consonants, transparent transient edge)
        // Release: 250ms (anti-pumping musical decay)
        let attack_sec = 0.015f32;
        let release_sec = 0.250f32;
        self.attack_coeff = (-1.0 / (attack_sec * self.sample_rate)).exp();
        self.release_coeff = (-1.0 / (release_sec * self.sample_rate)).exp();
    }

    /// Configure Upward Nuance Shaping parameters.
    /// - `max_lift_db`: Maximum provisional lift applied to quiet signals (default: +2.0 dB).
    /// - `low_threshold_db`: dBFS level below which maximum lift is reached (default: -24.0 dBFS).
    /// - `high_threshold_db`: dBFS level above which gain is strictly unity / 0.0 dB (default: -12.0 dBFS).
    pub fn set_upward_nuance_params(
        &mut self,
        max_lift_db: f32,
        low_threshold_db: f32,
        high_threshold_db: f32,
    ) {
        self.max_lift_db = max_lift_db.max(0.0);
        self.low_threshold_db = low_threshold_db;
        self.high_threshold_db = high_threshold_db.max(low_threshold_db + 1.0);
    }

    /// Configure noise gate taper parameters.
    /// Below `noise_gate_db`, lift smoothly tapers towards 0.0 dB at `noise_floor_db`.
    pub fn set_noise_gate_params(&mut self, noise_gate_db: f32, noise_floor_db: f32) {
        self.noise_gate_db = noise_gate_db;
        self.noise_floor_db = noise_floor_db.min(noise_gate_db - 1.0);
    }

    /// Current upward nuance configuration: `(max_lift_db, low_threshold_db, high_threshold_db)`.
    #[inline]
    pub fn upward_nuance_params(&self) -> (f32, f32, f32) {
        (self.max_lift_db, self.low_threshold_db, self.high_threshold_db)
    }

    /// Maximum provisional lift in dB.
    #[inline]
    pub fn max_lift_db(&self) -> f32 {
        self.max_lift_db
    }

    /// High threshold in dBFS (above which gain is strictly 0.0 dB).
    #[inline]
    pub fn high_threshold_db(&self) -> f32 {
        self.high_threshold_db
    }

    /// Low threshold in dBFS (below which maximum lift is reached).
    #[inline]
    pub fn low_threshold_db(&self) -> f32 {
        self.low_threshold_db
    }

    /// Compatibility helper for legacy downward compressor tuning.
    /// Maps threshold and makeup gain to upward nuance parameters.
    pub fn set_compressor_params(
        &mut self,
        threshold_db: f32,
        _knee_width_db: f32,
        _ratio: f32,
        makeup_gain_db: f32,
    ) {
        self.set_upward_nuance_params(makeup_gain_db, threshold_db, threshold_db + 12.0);
    }

    /// Change target sound profile with smooth transition and reversal safety.
    pub fn set_target_profile(&mut self, profile: SoundProfile) {
        if profile == self.target_profile {
            return;
        }

        self.target_profile = profile;

        match profile {
            SoundProfile::VocalNuanceBoost => match self.state {
                TransitionState::VocalNuanceBoost => {}
                TransitionState::StudioReference => {
                    self.state = TransitionState::TransitionToNuance;
                    self.transition_frame = 0;
                }
                TransitionState::TransitionToReference => {
                    // Reversal mid-ramp: invert progress from current alpha
                    self.state = TransitionState::TransitionToNuance;
                    let normalized_t = (1.0 - 2.0 * self.current_alpha)
                        .clamp(-1.0, 1.0)
                        .acos()
                        / std::f32::consts::PI;
                    self.transition_frame = ((normalized_t * self.transition_frames as f32).round()
                        as usize)
                        .min(self.transition_frames);
                }
                TransitionState::TransitionToNuance => {}
            },
            SoundProfile::StudioReference => match self.state {
                TransitionState::StudioReference => {}
                TransitionState::VocalNuanceBoost => {
                    self.state = TransitionState::TransitionToReference;
                    self.transition_frame = 0;
                }
                TransitionState::TransitionToNuance => {
                    // Reversal mid-ramp: invert progress from current alpha
                    self.state = TransitionState::TransitionToReference;
                    let ref_t = (2.0 * self.current_alpha - 1.0).clamp(-1.0, 1.0).acos()
                        / std::f32::consts::PI;
                    self.transition_frame =
                        ((ref_t * self.transition_frames as f32).round() as usize)
                            .min(self.transition_frames);
                }
                TransitionState::TransitionToReference => {}
            },
        }
    }

    /// Process a contiguous buffer of interleaved stereo f32 samples in-place.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if samples.is_empty() {
            return;
        }

        // Fast path: When StudioReference is active and not transitioning,
        // passthrough is 100% bit-for-bit identical without modulation.
        if self.state == TransitionState::StudioReference {
            // Keep nuance envelope tracking in background so profile switch has no transient jump
            for chunk in samples.chunks_exact(2) {
                let peak = chunk[0].abs().max(chunk[1].abs());
                if peak > self.nuance_envelope {
                    self.nuance_envelope = self.attack_coeff * self.nuance_envelope
                        + (1.0 - self.attack_coeff) * peak;
                } else {
                    self.nuance_envelope = self.release_coeff * self.nuance_envelope
                        + (1.0 - self.release_coeff) * peak;
                }
            }
            self.current_alpha = 0.0;
            return;
        }

        let n_frames = self.transition_frames as f32;

        for chunk in samples.chunks_exact_mut(2) {
            // 1. Advance transition state machine and S-curve alpha
            match self.state {
                TransitionState::StudioReference => {
                    self.current_alpha = 0.0;
                }
                TransitionState::VocalNuanceBoost => {
                    self.current_alpha = 1.0;
                }
                TransitionState::TransitionToNuance => {
                    let k = self.transition_frame as f32;
                    self.current_alpha =
                        0.5 * (1.0 - (std::f32::consts::PI * k / n_frames).cos());
                    self.transition_frame += 1;
                    if self.transition_frame >= self.transition_frames {
                        self.state = TransitionState::VocalNuanceBoost;
                        self.current_alpha = 1.0;
                    }
                }
                TransitionState::TransitionToReference => {
                    let k = self.transition_frame as f32;
                    self.current_alpha =
                        0.5 * (1.0 + (std::f32::consts::PI * k / n_frames).cos());
                    self.transition_frame += 1;
                    if self.transition_frame >= self.transition_frames {
                        self.state = TransitionState::StudioReference;
                        self.current_alpha = 0.0;
                    }
                }
            }

            let in_l = chunk[0];
            let in_r = chunk[1];
            let peak = in_l.abs().max(in_r.abs());

            // 2. Track nuance envelope
            if peak > self.nuance_envelope {
                self.nuance_envelope =
                    self.attack_coeff * self.nuance_envelope + (1.0 - self.attack_coeff) * peak;
            } else {
                self.nuance_envelope =
                    self.release_coeff * self.nuance_envelope + (1.0 - self.release_coeff) * peak;
            }

            // 3. Upward Nuance Shaping transfer function:
            // - For loud signals (>= high_threshold_db, e.g. -12 dBFS): 0.0 dB (unity gain, 100% untouched)
            // - For transition region (-24 dBFS .. -12 dBFS): smooth C^1 cubic Hermite spline
            // - For quiet signals (-60 dBFS .. -24 dBFS): gentle upward lift (+max_lift_db, e.g. +2.0 dB)
            // - Below -60 dBFS: smooth taper to 0.0 dB at -80 dBFS (noise floor protection)
            let env_db = 20.0 * (self.nuance_envelope.max(1e-6)).log10();
            let target_lift_db = if env_db >= self.high_threshold_db {
                0.0
            } else if env_db > self.low_threshold_db {
                let u = (env_db - self.low_threshold_db)
                    / (self.high_threshold_db - self.low_threshold_db);
                // Cubic Hermite smoothstep: s(0) = 1, s(1) = 0, s'(0) = 0, s'(1) = 0
                let s = 1.0 - (3.0 * u * u - 2.0 * u * u * u);
                self.max_lift_db * s
            } else if env_db >= self.noise_gate_db {
                self.max_lift_db
            } else if env_db > self.noise_floor_db {
                let v = (env_db - self.noise_floor_db)
                    / (self.noise_gate_db - self.noise_floor_db);
                let s_gate = 3.0 * v * v - 2.0 * v * v * v;
                self.max_lift_db * s_gate
            } else {
                0.0
            };

            let target_g = 10.0f32.powf(target_lift_db / 20.0);

            // Smooth nuance gain to eliminate audio clicks:
            // Attack (15ms) when gain drops toward unity on loud transients;
            // Release (250ms) when gain lifts quiet tails and nuances.
            if target_g < self.nuance_gain {
                self.nuance_gain =
                    self.attack_coeff * self.nuance_gain + (1.0 - self.attack_coeff) * target_g;
            } else {
                self.nuance_gain =
                    self.release_coeff * self.nuance_gain + (1.0 - self.release_coeff) * target_g;
            }

            // 4. Modulate composite gain: G[n] = (1 - alpha) * 1.000000 + alpha * nuance_gain
            let composite_gain = (1.0 - self.current_alpha) + self.current_alpha * self.nuance_gain;

            // 5. Apply time-aligned modulation (zero latency, zero delay comb)
            chunk[0] = in_l * composite_gain;
            chunk[1] = in_r * composite_gain;
        }
    }

    /// Reset internal state histories.
    pub fn reset_state(&mut self) {
        self.state = match self.target_profile {
            SoundProfile::StudioReference => TransitionState::StudioReference,
            SoundProfile::VocalNuanceBoost => TransitionState::VocalNuanceBoost,
        };
        self.transition_frame = 0;
        self.current_alpha = match self.target_profile {
            SoundProfile::StudioReference => 0.0,
            SoundProfile::VocalNuanceBoost => 1.0,
        };
        self.nuance_envelope = 0.0;
        self.nuance_gain = 1.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sound_profile_studio_reference_is_bit_transparent() {
        let mut stage = SoundProfileStage::new(48000.0);
        let mut audio = vec![0.123456f32, -0.654321, 0.99, -0.001, 0.0, 0.5];
        let original = audio.clone();

        stage.process(&mut audio);

        assert_eq!(stage.status(), SoundProfileStatus::Active);
        assert_eq!(stage.current_alpha(), 0.0);
        assert_eq!(audio, original, "StudioReference must pass samples bit-for-bit unchanged");
    }

    #[test]
    fn test_sound_profile_sample_rate_derived_transition_frames() {
        let mut stage = SoundProfileStage::new(48000.0);
        assert_eq!(stage.transition_frames(), 1440, "30ms at 48kHz = 1440 frames");

        stage.set_sample_rate(44100.0);
        assert_eq!(stage.transition_frames(), 1323, "30ms at 44.1kHz = 1323 frames");

        stage.set_sample_rate(96000.0);
        assert_eq!(stage.transition_frames(), 2880, "30ms at 96kHz = 2880 frames");

        stage.set_sample_rate(8000.0);
        assert_eq!(stage.transition_frames(), 240, "30ms at 8kHz = 240 frames");
    }

    #[test]
    fn test_sound_profile_transition_reversal_safety() {
        let mut stage = SoundProfileStage::new(48000.0);
        stage.set_target_profile(SoundProfile::VocalNuanceBoost);
        assert_eq!(stage.state(), TransitionState::TransitionToNuance);

        // Process halfway (720 frames = 1440 samples stereo)
        let mut dummy = vec![0.1f32; 1440];
        stage.process(&mut dummy);

        let mid_alpha = stage.current_alpha();
        assert!(mid_alpha > 0.4 && mid_alpha < 0.6, "Alpha should be ~0.5 at halfway mark");

        // Immediately reverse mid-transition
        stage.set_target_profile(SoundProfile::StudioReference);
        assert_eq!(stage.state(), TransitionState::TransitionToReference);

        // First sample after reversal should not jump
        let mut one_frame = vec![0.1f32; 2];
        stage.process(&mut one_frame);
        let post_reverse_alpha = stage.current_alpha();

        assert!(
            (post_reverse_alpha - mid_alpha).abs() < 0.02,
            "Reversal must be continuous from mid_alpha, got delta = {}",
            (post_reverse_alpha - mid_alpha).abs()
        );
    }

    #[test]
    fn test_sound_profile_option_b_upward_nuance_behavior() {
        let sample_rate = 48000.0f32;
        let mut stage = SoundProfileStage::new(sample_rate);
        stage.set_target_profile(SoundProfile::VocalNuanceBoost);

        // Advance transition to active VocalNuanceBoost
        let mut ramp_buf = vec![0.1f32; 3000];
        stage.process(&mut ramp_buf);
        assert_eq!(stage.status(), SoundProfileStatus::Active);
        assert_eq!(stage.current_alpha(), 1.0);

        // 1. Loud material (e.g. -6 dBFS): Must remain untouched at 0.0 dB / unity gain
        let loud_amp = 10.0f32.powf(-6.0 / 20.0);
        let mut loud_buf = vec![loud_amp; 48000]; // 500ms
        stage.process(&mut loud_buf);
        let loud_gain = stage.nuance_gain();
        let loud_gain_db = 20.0 * loud_gain.log10();
        assert!(
            loud_gain_db.abs() < 0.05,
            "Loud material (>= -12 dBFS) must have 0.0 dB gain, got {loud_gain_db:+.3} dB (gain={loud_gain:.4})"
        );

        // 2. Quiet nuance material (e.g. -30 dBFS): Must receive provisional lift (+2.0 dB)
        let quiet_amp = 10.0f32.powf(-30.0 / 20.0);
        let mut quiet_buf = vec![quiet_amp; 240000]; // 2.5s to allow 250ms cascaded filters to fully settle
        stage.process(&mut quiet_buf);
        let quiet_gain = stage.nuance_gain();
        let quiet_gain_db = 20.0 * quiet_gain.log10();
        assert!(
            (quiet_gain_db - 2.0).abs() < 0.05,
            "Quiet material (< -24 dBFS) must receive provisional +2.0 dB lift, got {quiet_gain_db:+.3} dB"
        );

        // 3. Mid-level transition material (e.g. -18 dBFS): Smooth midway lift (~ +1.0 dB)
        let mid_amp = 10.0f32.powf(-18.0 / 20.0);
        let mut mid_buf = vec![mid_amp; 240000];
        stage.process(&mut mid_buf);
        let mid_gain = stage.nuance_gain();
        let mid_gain_db = 20.0 * mid_gain.log10();
        assert!(
            (mid_gain_db - 1.0).abs() < 0.10,
            "Mid-level material (-18 dBFS) must receive ~ +1.0 dB lift, got {mid_gain_db:+.3} dB"
        );

        // 4. Deep silence (< -80 dBFS): Noise floor gate must prevent amplification
        let silence_amp = 10.0f32.powf(-90.0 / 20.0);
        let mut silence_buf = vec![silence_amp; 240000];
        stage.process(&mut silence_buf);
        let silence_gain = stage.nuance_gain();
        let silence_gain_db = 20.0 * silence_gain.log10();
        assert!(
            silence_gain_db < 0.05,
            "Deep silence (< -80 dBFS) must not be amplified, got {silence_gain_db:+.3} dB"
        );
    }
}
