//! Nora SoundProfile DSP processor.
//!
//! Provides two presentation profiles:
//! 1. `StudioReference`: Bit-transparent passthrough with zero tonal or dynamic coloration.
//! 2. `VocalNuanceBoost`: Soft-knee dynamic contour lifting low-level nuances, vocal intimacy,
//!    and reverberant decay while preserving high-energy transients.
//!
//! Features:
//! - Primary Prototype Architecture (Option A): Zero lookahead (0.00ms added latency).
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
    threshold_db: f32,
    knee_width_db: f32,
    ratio: f32,
    makeup_gain_db: f32,
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
            threshold_db: -24.0,
            knee_width_db: 12.0,
            ratio: 2.5,
            makeup_gain_db: 3.0,
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

            // 3. Compute soft-knee gain reduction in dB
            let env_db = 20.0 * (self.nuance_envelope.max(1e-6)).log10();
            let half_knee = self.knee_width_db * 0.5;
            let gain_red_db = if env_db < self.threshold_db - half_knee {
                0.0
            } else if env_db <= self.threshold_db + half_knee {
                let diff = env_db - self.threshold_db + half_knee;
                ((1.0 / self.ratio - 1.0) * diff * diff) / (2.0 * self.knee_width_db)
            } else {
                (self.threshold_db + (env_db - self.threshold_db) / self.ratio) - env_db
            };

            let target_g = 10.0f32.powf((gain_red_db + self.makeup_gain_db) / 20.0);

            // Smooth nuance gain to eliminate audio clicks
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
}
