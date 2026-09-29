//! Ordered DSP processing chain enforcing architectural invariants.
//!
//! Chain execution order:
//! `Mixer / Crossfade -> ReplayGain -> 10-Band EQ -> Mid-Side Karaoke -> 5ms Limiter -> Output`
//!
//! When `bypass` mode is active, ReplayGain, EQ, Karaoke, and Limiter are completely short-circuited.

use serde::{Deserialize, Serialize};

use crate::dsp::eq::EqualizerChain;
use crate::dsp::karaoke::KaraokeProcessor;
use crate::dsp::limiter::PeakLimiter;
use crate::dsp::replaygain::ReplayGainProcessor;

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
    /// Enable 5ms lookahead peak safety limiter.
    pub limiter: bool,
}

impl Default for DspConfig {
    fn default() -> Self {
        Self {
            bypass: false,
            replaygain_db: 0.0,
            eq_gains: [0.0; 10],
            karaoke: false,
            limiter: true,
        }
    }
}

/// Ordered DSP pipeline processing interleaved stereo f32 samples.
pub struct DspPipeline {
    config: DspConfig,
    replaygain: ReplayGainProcessor,
    eq: EqualizerChain,
    karaoke: KaraokeProcessor,
    limiter: PeakLimiter,
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
        let limiter = PeakLimiter::new(sample_rate);

        Self {
            config,
            replaygain,
            eq,
            karaoke,
            limiter,
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
        self.limiter.set_enabled(config.limiter);
        self.config = config;
    }

    /// Set bypass mode state.
    pub fn set_bypass(&mut self, bypass: bool) {
        self.config.bypass = bypass;
    }

    /// Update sample rate across rate-sensitive DSP processors (EQ, Limiter).
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.eq.set_sample_rate(sample_rate);
        self.limiter.set_sample_rate(sample_rate);
    }

    /// Process a contiguous buffer of interleaved stereo f32 samples in-place.
    ///
    /// Execution order:
    /// 1. ReplayGain
    /// 2. 10-Band Peaking Equalizer
    /// 3. Mid-Side Karaoke vocal attenuator
    /// 4. 5ms Lookahead Peak Limiter
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

        // 4. Peak Limiter
        self.limiter.process(samples);
    }

    /// Reset internal state across all constituent filters.
    pub fn reset_state(&mut self) {
        self.eq.reset_state();
        self.karaoke.reset_state();
        self.limiter.reset_state();
    }
}
