//! Mid-Side Karaoke vocal attenuation processor for the Nora Native Audio Engine.
//!
//! Decomposes stereo audio into Mid (sum) and Side (difference) channels,
//! attenuating center-panned vocals while preserving bass frequencies and stereo spread.

/// Mid-Side Karaoke processor.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct KaraokeProcessor {
    enabled: bool,
    sample_rate: f32,
    vocal_attenuation: f32, // 0.0 = complete center removal, 1.0 = normal
    bass_preservation: f32, // fraction of low bass to preserve
    bass_filter_l: f32,
    bass_filter_r: f32,
}

impl Default for KaraokeProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl KaraokeProcessor {
    /// Create a new KaraokeProcessor (initially disabled).
    pub const fn new() -> Self {
        Self {
            enabled: false,
            sample_rate: 48000.0,
            vocal_attenuation: 0.05, // 95% center vocal reduction
            bass_preservation: 0.8,
            bass_filter_l: 0.0,
            bass_filter_r: 0.0,
        }
    }

    /// Update sample rate so the bass-preservation crossover stays at ~150 Hz
    /// across 8 kHz..192 kHz instead of wandering 25 Hz..610 Hz.
    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate.max(8000.0);
    }

    /// Enable or disable vocal removal.
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            self.bass_filter_l = 0.0;
            self.bass_filter_r = 0.0;
        }
    }

    /// Return whether karaoke processing is currently active.
    #[inline]
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Process a buffer of interleaved stereo f32 samples in-place.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    ///
    /// NOTE: hard-panned material is intentionally collapsed toward center
    /// (L=1,R=0 -> approx (0.53,-0.48)); this is inherent to mid-side vocal
    /// attenuation, not stereo preservation.
    #[inline]
    pub fn process(&mut self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        // 1-pole lowpass for bass preservation, normalized to ~150 Hz at any
        // rate: alpha = 1 - exp(-2*pi*fc/fs).
        let alpha =
            1.0 - (-2.0 * std::f32::consts::PI * 150.0 / self.sample_rate.max(8000.0)).exp();

        for chunk in samples.chunks_exact_mut(2) {
            let left = chunk[0];
            let right = chunk[1];

            // 1. Track low-frequency bass via simple leaky integrator
            self.bass_filter_l += alpha * (left - self.bass_filter_l);
            self.bass_filter_r += alpha * (right - self.bass_filter_r);
            if self.bass_filter_l.abs() < 1e-30 {
                self.bass_filter_l = 0.0;
            }
            if self.bass_filter_r.abs() < 1e-30 {
                self.bass_filter_r = 0.0;
            }
            let bass = (self.bass_filter_l + self.bass_filter_r) * 0.5;

            // 2. Mid-Side decomposition
            let mid = (left + right) * 0.5;
            let side = (left - right) * 0.5;

            // 3. Attenuate center-panned vocal frequencies while retaining low bass
            let processed_mid = mid * self.vocal_attenuation + bass * self.bass_preservation;

            // 4. Reconstruct stereo left and right
            chunk[0] = processed_mid + side;
            chunk[1] = processed_mid - side;
        }
    }

    /// Reset internal state.
    pub fn reset_state(&mut self) {
        self.bass_filter_l = 0.0;
        self.bass_filter_r = 0.0;
    }
}
