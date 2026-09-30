//! Real-time DSP subsystem for the Nora Native Audio Engine.
//!
//! Provides ReplayGain scaling, 10-band peaking biquad equalization,
//! mid-side karaoke center vocal attenuation, and a 5ms lookahead peak safety limiter.

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
pub use limiter::PeakLimiter;
pub use replaygain::ReplayGainProcessor;
pub use sound_profile::{SoundProfileStage, TransitionState};
pub use true_peak::TruePeakLimiter;
