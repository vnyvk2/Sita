//! ReplayGain processor scaling linear amplitude based on target track/album gain in dB.

/// ReplayGain processor applying decibel-to-linear amplitude scaling.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReplayGainProcessor {
    gain_db: f32,
    linear_multiplier: f32,
    enabled: bool,
}

impl Default for ReplayGainProcessor {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayGainProcessor {
    /// Create a new ReplayGain processor at unity gain (0.0 dB).
    pub const fn new() -> Self {
        Self {
            gain_db: 0.0,
            linear_multiplier: 1.0,
            enabled: false,
        }
    }

    /// Set ReplayGain in decibels (e.g. -6.5 dB or +2.0 dB).
    pub fn set_gain_db(&mut self, db: f32) {
        self.gain_db = db.clamp(-60.0, 20.0);
        // Formula: linear = 10^(dB / 20)
        self.linear_multiplier = 10.0f32.powf(self.gain_db / 20.0);
        self.enabled = self.gain_db.abs() > 0.001;
    }

    /// Return current gain in decibels.
    #[inline]
    pub fn gain_db(&self) -> f32 {
        self.gain_db
    }

    /// Return current linear amplitude multiplier.
    #[inline]
    pub fn linear_multiplier(&self) -> f32 {
        self.linear_multiplier
    }

    /// Return whether ReplayGain scaling is actively enabled.
    #[inline]
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Process a contiguous buffer of interleaved stereo f32 samples in-place.
    /// Real-time safe: Zero allocations, zero syscalls, zero mutexes, never panics.
    #[inline]
    pub fn process(&self, samples: &mut [f32]) {
        if !self.enabled || samples.is_empty() {
            return;
        }

        let mul = self.linear_multiplier;
        for s in samples.iter_mut() {
            *s *= mul;
        }
    }
}
