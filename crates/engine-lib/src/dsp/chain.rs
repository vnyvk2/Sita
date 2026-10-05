//! Ordered DSP processing chain enforcing architectural invariants.
//!
//! Chain execution order:
//! `Mixer / Crossfade -> ReplayGain -> 10-Band EQ -> Mid-Side Karaoke -> SoundProfileStage -> TruePeakLimiter -> Master Volume -> Output`
//!
//! When `bypass` mode is active, ReplayGain, EQ, Karaoke, SoundProfile, and Limiter are completely short-circuited.
//! When StudioReference is active (with flat EQ, 0 dB ReplayGain, Karaoke disabled):
//! For a signal that has never caused protection to engage (or after the limiter has fully settled
//! back to steady-state release) and whose estimated true peak remains below the threshold,
//! gain remains exactly 1.000000.

use engine_protocol::{SoundProfile, SoundProfileStatus};
use serde::{Deserialize, Serialize};

use crate::dsp::eq::{EqProfile, EqualizerChain};
use crate::dsp::karaoke::KaraokeProcessor;
use crate::dsp::replaygain::ReplayGainProcessor;
use crate::dsp::sound_profile::SoundProfileStage;
use crate::dsp::true_peak::TruePeakLimiter;

/// Configuration snapshot controlling the DSP chain.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DspConfig {
    /// Global DSP bypass. When true, all post-mixer processing is short-circuited.
    pub bypass: bool,
    /// ReplayGain adjustment in decibels.
    pub replaygain_db: f32,
    /// 10-Band equalizer gains (-24dB to +24dB).
    pub eq_gains: [f32; 10],
    /// Enable mid-side center vocal reduction.
    pub karaoke: bool,
    /// Enable digital true-peak safety limiter.
    pub limiter: bool,
    /// Presentation sound profile (StudioReference default, VocalNuanceBoost optional).
    #[serde(default)]
    pub sound_profile: SoundProfile,
}

impl Default for DspConfig {
    fn default() -> Self {
        Self {
            bypass: false,
            replaygain_db: 0.0,
            eq_gains: [0.0; 10],
            karaoke: false,
            limiter: true,
            sound_profile: SoundProfile::default(),
        }
    }
}

/// Ordered DSP pipeline processing interleaved stereo f32 samples.
pub struct DspPipeline {
    config: DspConfig,
    replaygain: ReplayGainProcessor,
    eq: EqualizerChain,
    karaoke: KaraokeProcessor,
    sound_profile: SoundProfileStage,
    true_peak: TruePeakLimiter,
}

impl Default for DspPipeline {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl DspPipeline {
    /// Create a new DSP pipeline initialized for the specified sample rate.
    pub fn new(sample_rate: f32) -> Self {
        let config = DspConfig::default();
        let replaygain = ReplayGainProcessor::new();
        let eq = EqualizerChain::new(sample_rate);
        let karaoke = KaraokeProcessor::new();
        let sound_profile = SoundProfileStage::new(sample_rate);
        let true_peak = TruePeakLimiter::new(sample_rate);

        Self {
            config,
            replaygain,
            eq,
            karaoke,
            sound_profile,
            true_peak,
        }
    }

    /// Access current DSP configuration.
    #[inline]
    pub fn config(&self) -> &DspConfig {
        &self.config
    }

    /// Apply a new DSP configuration across all constituent processors.
    pub fn update_config(&mut self, config: DspConfig) {
        self.replaygain.set_gain_db(config.replaygain_db);
        self.eq.set_gains(config.eq_gains);
        self.karaoke.set_enabled(config.karaoke);
        self.sound_profile.set_target_profile(config.sound_profile);
        self.true_peak.set_enabled(config.limiter);
        self.config = config;
    }

    /// Apply EQ gains from a live context: persists them into config but ramps
    /// coefficients smoothly (T-EQ-SMOOTH) instead of stepping. Real-time safe.
    pub fn set_eq_gains_smooth(&mut self, gains: [f32; 10]) {
        let mut clamped = [0.0f32; 10];
        for (i, &g) in gains.iter().enumerate() {
            clamped[i] = g.clamp(-24.0, 24.0);
        }
        self.config.eq_gains = clamped;
        self.eq.set_target_gains(clamped);
    }

    /// Set bypass mode state.
    pub fn set_bypass(&mut self, bypass: bool) {
        if self.config.bypass != bypass {
            self.config.bypass = bypass;
            // Stale EQ histories / limiter delay / karaoke integrators would
            // otherwise thump on re-enable.
            self.reset_state();
        }
    }

    /// Set presentation sound profile.
    #[inline]
    pub fn set_sound_profile(&mut self, profile: SoundProfile) {
        self.config.sound_profile = profile;
        self.sound_profile.set_target_profile(profile);
    }

    /// Current target sound profile.
    #[inline]
    pub fn sound_profile(&self) -> SoundProfile {
        self.sound_profile.target_profile()
    }

    /// Set equalizer profile (defaults to EqProfile::LegacyWebAudio).
    #[inline]
    pub fn set_eq_profile(&mut self, profile: EqProfile) {
        self.eq.set_profile(profile);
    }

    /// Current active equalizer profile.
    #[inline]
    pub fn eq_profile(&self) -> EqProfile {
        self.eq.profile()
    }

    /// Access internal equalizer chain.
    #[inline]
    pub fn equalizer(&self) -> &EqualizerChain {
        &self.eq
    }

    /// Mutable access to internal equalizer chain.
    #[inline]
    pub fn equalizer_mut(&mut self) -> &mut EqualizerChain {
        &mut self.eq
    }

    /// High-level profile transition status (Active vs Transitioning).
    #[inline]
    pub fn sound_profile_status(&self) -> SoundProfileStatus {
        self.sound_profile.status()
    }

    /// Access internal sound profile stage.
    #[inline]
    pub fn sound_profile_stage(&self) -> &SoundProfileStage {
        &self.sound_profile
    }

    /// Mutable access to internal sound profile stage.
    #[inline]
    pub fn sound_profile_stage_mut(&mut self) -> &mut SoundProfileStage {
        &mut self.sound_profile
    }

    /// Access internal true-peak limiter.
    #[inline]
    pub fn true_peak_limiter(&self) -> &TruePeakLimiter {
        &self.true_peak
    }

    /// Mutable access to internal true-peak limiter.
    #[inline]
    pub fn true_peak_limiter_mut(&mut self) -> &mut TruePeakLimiter {
        &mut self.true_peak
    }

    /// Update sample rate across rate-sensitive DSP processors (EQ, SoundProfile, Limiter).
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.eq.set_sample_rate(sample_rate);
        self.karaoke.set_sample_rate(sample_rate);
        self.sound_profile.set_sample_rate(sample_rate);
        self.true_peak.set_sample_rate(sample_rate);
        // Old delay lines/histories are at the previous rate's length.
        self.reset_state();
    }

    /// Process a contiguous buffer of interleaved stereo f32 samples in-place.
    ///
    /// Execution order:
    /// 1. ReplayGain
    /// 2. 10-Band Peaking Equalizer
    /// 3. Mid-Side Karaoke vocal attenuator
    /// 4. SoundProfile Stage (Zero lookahead Option A, smooth 30ms transition)
    /// 5. Digital True-Peak Limiter (Sidechain-only 4x FIR, 1.08ms lookahead)
    ///
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if self.config.bypass || samples.is_empty() {
            return;
        }

        // 1. ReplayGain
        self.replaygain.process(samples);

        // 2. 10-Band EQ
        self.eq.process(samples);

        // 3. Mid-Side Karaoke
        self.karaoke.process(samples);

        // 4. SoundProfile Stage
        self.sound_profile.process(samples);

        // 5. True-Peak Limiter
        self.true_peak.process(samples);
    }

    /// Reset internal state across all constituent filters.
    pub fn reset_state(&mut self) {
        self.eq.reset_state();
        self.karaoke.reset_state();
        self.sound_profile.reset_state();
        self.true_peak.reset_state();
    }
}
