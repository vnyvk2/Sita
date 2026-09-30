//! Real-time DSP subsystem for the Nora Native Audio Engine.
//!
//! Provides ReplayGain scaling, 10-band peaking biquad equalization,
//! mid-side karaoke center vocal attenuation, SoundProfile presentation switching,
//! and ITU-R BS.1770-4 4x oversampled TruePeakLimiter output protection.

pub mod chain;
pub mod eq;
pub mod karaoke;
pub mod limiter;
pub mod replaygain;
pub mod sound_profile;
pub mod true_peak;

pub use chain::{DspConfig, DspPipeline};
pub use eq::{BiquadFilter, EqualizerChain, EQ_CENTER_FREQUENCIES, EQ_DEFAULT_Q};
pub use karaoke::KaraokeProcessor;
#[allow(deprecated)]
pub use limiter::PeakLimiter;
pub use replaygain::ReplayGainProcessor;
pub use sound_profile::{SoundProfileStage, TransitionState};
pub use true_peak::{TruePeakLimiter, POLYPHASE_COEFFS, POLYPHASE_TAPS};
