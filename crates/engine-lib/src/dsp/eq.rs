//! 10-Band Peaking Graphic Equalizer using Robert Bristow-Johnson (RBJ) biquad filters.

/// Center frequencies for Nora's Web Audio legacy equalizer (32 Hz to 16 kHz).
pub const EQ_LEGACY_FREQUENCIES: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Quality factor (Q) for Web Audio legacy equalizer.
pub const EQ_LEGACY_Q: f32 = 1.0;

/// Center frequencies for standard 10-band ISO 266 octave equalizer (31.25 Hz to 16 kHz).
pub const EQ_ISO_FREQUENCIES: [f32; 10] = [
    31.25, 62.5, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Quality factor (Q) for standard 1-octave band ISO equalizer.
pub const EQ_ISO_Q: f32 = std::f32::consts::SQRT_2;

/// Default center frequencies (defaults to LegacyWebAudio for backwards compatibility and WebAudio parity).
pub const EQ_CENTER_FREQUENCIES: [f32; 10] = EQ_LEGACY_FREQUENCIES;

/// Default quality factor (Q) (defaults to LegacyWebAudio for backwards compatibility and WebAudio parity).
pub const EQ_DEFAULT_Q: f32 = EQ_LEGACY_Q;

/// Profile determining the equalizer center frequencies and quality factor (Q).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum EqProfile {
    /// WebAudio legacy profile: Q=1.0, [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] Hz.
    /// Default mode for 100% acoustic and preset compatibility with Nora's Web Audio fallback.
    #[default]
    LegacyWebAudio,
    /// Standard ISO 266 1-octave profile: Q=sqrt(2) ≈ 1.4142, [31.25, 62.5, 125, ...] Hz.
    IsoOctave,
}

impl EqProfile {
    /// Return the center frequencies associated with this EQ profile.
    #[inline]
    pub const fn center_frequencies(&self) -> &'static [f32; 10] {
        match self {
            Self::LegacyWebAudio => &EQ_LEGACY_FREQUENCIES,
            Self::IsoOctave => &EQ_ISO_FREQUENCIES,
        }
    }

    /// Return the filter quality factor (Q) associated with this EQ profile.
    #[inline]
    pub const fn q_factor(&self) -> f32 {
        match self {
            Self::LegacyWebAudio => EQ_LEGACY_Q,
            Self::IsoOctave => EQ_ISO_Q,
        }
    }
}

/// Direct Form I biquad filter coefficients and channel delay state.
#[derive(Debug, Clone, Copy)]
pub struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    // Channel delay states: [ch0_x1, ch0_x2, ch0_y1, ch0_y2], [ch1_x1, ...]
    state: [[f32; 4]; 2],
    is_passthrough: bool,
}

impl Default for BiquadFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl BiquadFilter {
    pub const fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            state: [[0.0; 4]; 2],
            is_passthrough: true,
        }
    }

    /// Recompute peaking EQ biquad filter coefficients according to RBJ Audio EQ Cookbook.
    pub fn update_peaking(&mut self, sample_rate: f32, freq_hz: f32, gain_db: f32, q: f32) {
        if gain_db.abs() < 0.01 || sample_rate <= 0.0 {
            self.b0 = 1.0;
            self.b1 = 0.0;
            self.b2 = 0.0;
            self.a1 = 0.0;
            self.a2 = 0.0;
            self.is_passthrough = true;
            return;
        }

        // Bands above Nyquist cannot be represented: pass through instead of
        // silently retuning to the wrong octave via clamping.
        if freq_hz > 0.45 * sample_rate {
            self.b0 = 1.0;
            self.b1 = 0.0;
            self.b2 = 0.0;
            self.a1 = 0.0;
            self.a2 = 0.0;
            self.is_passthrough = true;
            return;
        }

        self.is_passthrough = false;
        // Compute in f64 for stability at low-freq/high-rate corners
        // (e.g. 31.25 Hz @ 192 kHz), then cast to f32 state.
        let clamped_gain = gain_db.clamp(-24.0, 24.0) as f64;
        let a = 10.0f64.powf(clamped_gain / 40.0);
        let w0 = 2.0 * std::f64::consts::PI * (freq_hz as f64 / sample_rate as f64);
        let alpha = w0.sin() / (2.0 * (q.max(0.1) as f64));

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * w0.cos();
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * w0.cos();
        let a2 = 1.0 - alpha / a;

        self.b0 = (b0 / a0) as f32;
        self.b1 = (b1 / a0) as f32;
        self.b2 = (b2 / a0) as f32;
        self.a1 = (a1 / a0) as f32;
        self.a2 = (a2 / a0) as f32;
    }

    /// Process a single channel sample through the biquad filter.
    #[inline]
    pub fn process_sample(&mut self, ch: usize, input: f32) -> f32 {
        if self.is_passthrough {
            return input;
        }

        let s = &mut self.state[ch];
        let x1 = s[0];
        let x2 = s[1];
        let y1 = s[2];
        let y2 = s[3];

        let out = self.b0 * input + self.b1 * x1 + self.b2 * x2 - self.a1 * y1 - self.a2 * y2;

        s[1] = x1;
        s[0] = input;
        s[3] = y1;
        // Flush subnormals to zero: silent EQ histories otherwise decay into
        // denormals and spike x86 CPUs without FTZ.
        s[2] = if out.abs() < 1e-30 { 0.0 } else { out };

        s[2]
    }

    /// Reset filter state variables to zero.
    pub fn reset_state(&mut self) {
        self.state = [[0.0; 4]; 2];
    }

    /// Normalized Direct Form I coefficients: (b0, b1, b2, a1, a2).
    #[inline]
    pub const fn coefficients(&self) -> (f32, f32, f32, f32, f32) {
        (self.b0, self.b1, self.b2, self.a1, self.a2)
    }

    /// Whether this filter is currently in bit-transparent passthrough mode.
    #[inline]
    pub const fn is_passthrough(&self) -> bool {
        self.is_passthrough
    }
}

/// 10-Band Graphic Equalizer pipeline processing interleaved stereo audio.
#[derive(Debug, Clone)]
pub struct EqualizerChain {
    sample_rate: f32,
    gains: [f32; 10],
    profile: EqProfile,
    bands: [BiquadFilter; 10],
    is_active: bool,
}

impl Default for EqualizerChain {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl EqualizerChain {
    /// Create a new 10-band equalizer initialized flat (0.0 dB all bands) with default LegacyWebAudio profile.
    pub fn new(sample_rate: f32) -> Self {
        Self::new_with_profile(sample_rate, EqProfile::LegacyWebAudio)
    }

    /// Create a new 10-band equalizer with a specific EQ profile.
    pub fn new_with_profile(sample_rate: f32, profile: EqProfile) -> Self {
        let mut eq = Self {
            sample_rate: sample_rate.max(8000.0),
            gains: [0.0; 10],
            profile,
            bands: [BiquadFilter::new(); 10],
            is_active: false,
        };
        eq.recalculate();
        eq
    }

    /// Get current EQ profile.
    #[inline]
    pub fn profile(&self) -> EqProfile {
        self.profile
    }

    /// Update EQ profile and recalculate filter coefficients.
    pub fn set_profile(&mut self, profile: EqProfile) {
        if self.profile != profile {
            self.profile = profile;
            self.recalculate();
        }
    }

    /// Get current center frequencies for the active profile.
    #[inline]
    pub fn center_frequencies(&self) -> &'static [f32; 10] {
        self.profile.center_frequencies()
    }

    /// Get current Q factor for the active profile.
    #[inline]
    pub fn q_factor(&self) -> f32 {
        self.profile.q_factor()
    }

    /// Get current gains across all 10 bands.
    #[inline]
    pub fn gains(&self) -> &[f32; 10] {
        &self.gains
    }

    /// Check if EQ is currently actively modifying audio (any band |gain| > 0.01 dB).
    #[inline]
    pub fn is_active(&self) -> bool {
        self.is_active
    }

    /// Access internal biquad filters across all 10 bands.
    #[inline]
    pub fn bands(&self) -> &[BiquadFilter; 10] {
        &self.bands
    }

    /// Update sample rate and recalculate filter coefficients.
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
        self.recalculate();
    }

    /// Set gain for all 10 bands (-24.0 dB to +24.0 dB).
    pub fn set_gains(&mut self, gains: [f32; 10]) {
        for (i, &g) in gains.iter().enumerate() {
            self.gains[i] = g.clamp(-24.0, 24.0);
        }
        self.recalculate();
    }

    /// Set a single band's gain by index.
    pub fn set_band_gain(&mut self, band_idx: usize, gain_db: f32) {
        if band_idx < 10 {
            self.gains[band_idx] = gain_db.clamp(-24.0, 24.0);
            let freqs = self.profile.center_frequencies();
            let q = self.profile.q_factor();
            self.bands[band_idx].update_peaking(
                self.sample_rate,
                freqs[band_idx],
                self.gains[band_idx],
                q,
            );
            self.update_active_status();
        }
    }

    /// Reset all 10 bands to flat response (0 dB).
    pub fn reset_flat(&mut self) {
        self.gains = [0.0; 10];
        self.recalculate();
    }

    fn recalculate(&mut self) {
        let freqs = self.profile.center_frequencies();
        let q = self.profile.q_factor();
        for (band, (&freq, &gain)) in self
            .bands
            .iter_mut()
            .zip(freqs.iter().zip(self.gains.iter()))
        {
            band.update_peaking(self.sample_rate, freq, gain, q);
        }
        self.update_active_status();
    }

    fn update_active_status(&mut self) {
        self.is_active = self.gains.iter().any(|g| g.abs() > 0.01);
    }

    /// Process a buffer of interleaved stereo f32 samples in-place.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.is_active || samples.is_empty() {
            return;
        }

        for chunk in samples.chunks_exact_mut(2) {
            let mut left = chunk[0];
            let mut right = chunk[1];

            for band in &mut self.bands {
                left = band.process_sample(0, left);
                right = band.process_sample(1, right);
            }

            chunk[0] = left;
            chunk[1] = right;
        }
    }

    /// Reset internal filter histories across all bands.
    pub fn reset_state(&mut self) {
        for band in &mut self.bands {
            band.reset_state();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_profile_is_legacy_web_audio() {
        let eq = EqualizerChain::new(48000.0);
        assert_eq!(eq.profile(), EqProfile::LegacyWebAudio);
        assert_eq!(eq.q_factor(), 1.0);
        assert_eq!(eq.center_frequencies(), &EQ_LEGACY_FREQUENCIES);
        assert_eq!(eq.center_frequencies()[0], 32.0);
        assert_eq!(eq.center_frequencies()[1], 64.0);
        assert_eq!(eq.center_frequencies()[9], 16000.0);
    }

    #[test]
    fn test_iso_octave_profile_constants() {
        let eq = EqualizerChain::new_with_profile(48000.0, EqProfile::IsoOctave);
        assert_eq!(eq.profile(), EqProfile::IsoOctave);
        assert!((eq.q_factor() - std::f32::consts::SQRT_2).abs() < 1e-6);
        assert_eq!(eq.center_frequencies(), &EQ_ISO_FREQUENCIES);
        assert_eq!(eq.center_frequencies()[0], 31.25);
        assert_eq!(eq.center_frequencies()[1], 62.5);
        assert_eq!(eq.center_frequencies()[9], 16000.0);
    }

    #[test]
    fn test_profile_switching_recalculates() {
        let mut eq = EqualizerChain::new(48000.0);
        eq.set_band_gain(0, 6.0); // +6dB at band 0
        assert_eq!(eq.profile(), EqProfile::LegacyWebAudio);
        let b0_legacy = eq.bands[0].b0;

        eq.set_profile(EqProfile::IsoOctave);
        assert_eq!(eq.profile(), EqProfile::IsoOctave);
        let b0_iso = eq.bands[0].b0;

        // Changing from 32Hz Q=1.0 to 31.25Hz Q=sqrt(2) must alter coefficients
        assert!((b0_legacy - b0_iso).abs() > 1e-6);
    }

    #[test]
    fn test_flat_bypass_identity() {
        let mut eq = EqualizerChain::new(48000.0);
        assert!(!eq.is_active());
        let mut samples = vec![0.123f32, -0.456, 0.789, -0.012];
        let original = samples.clone();
        eq.process(&mut samples);
        assert_eq!(samples, original);
    }

    #[test]
    fn test_nyquist_guard_passthrough() {
        let mut filter = BiquadFilter::new();
        // 22 kHz @ 44.1 kHz is > 0.45 * fs (Nyquist guard)
        filter.update_peaking(44100.0, 22000.0, 6.0, 1.0);
        assert!(filter.is_passthrough);
        assert_eq!(filter.process_sample(0, 0.5), 0.5);
    }
}
