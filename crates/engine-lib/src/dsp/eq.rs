//! 10-Band Peaking Graphic Equalizer using Robert Bristow-Johnson (RBJ) biquad filters.

/// Center frequencies for standard 10-band ISO octave equalizer.
pub const EQ_CENTER_FREQUENCIES: [f32; 10] = [
    31.25, 62.5, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Quality factor (Q) for 1-octave band filters.
pub const EQ_DEFAULT_Q: f32 = 1.4142;

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
}

/// 10-Band Graphic Equalizer pipeline processing interleaved stereo audio.
#[derive(Debug, Clone)]
pub struct EqualizerChain {
    sample_rate: f32,
    gains: [f32; 10],
    bands: [BiquadFilter; 10],
    is_active: bool,
}

impl Default for EqualizerChain {
    fn default() -> Self {
        Self::new(48000.0)
    }
}

impl EqualizerChain {
    /// Create a new 10-band equalizer initialized flat (0.0 dB all bands).
    pub fn new(sample_rate: f32) -> Self {
        let mut eq = Self {
            sample_rate: sample_rate.max(8000.0),
            gains: [0.0; 10],
            bands: [BiquadFilter::new(); 10],
            is_active: false,
        };
        eq.recalculate();
        eq
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
            self.bands[band_idx].update_peaking(
                self.sample_rate,
                EQ_CENTER_FREQUENCIES[band_idx],
                self.gains[band_idx],
                EQ_DEFAULT_Q,
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
        for i in 0..10 {
            self.bands[i].update_peaking(
                self.sample_rate,
                EQ_CENTER_FREQUENCIES[i],
                self.gains[i],
                EQ_DEFAULT_Q,
            );
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
