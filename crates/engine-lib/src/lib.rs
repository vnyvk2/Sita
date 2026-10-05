//! Nora Native Rust Audio Engine (`engine-lib`)
//!
//! Isolated, high-performance native audio subsystem for Nora Music Player.
//! Features lock-free bounded SPSC streaming, Symphonia decoding, pluggable offline/online sinks,
//! and strict real-time callback safety.

pub mod types;
pub mod decoder;
pub mod buffer;
pub mod sink;
pub mod mixer;
pub mod dsp;

pub use types::*;
pub use decoder::{
    parse_itunsmpb, parse_lame_tag, DecoderPipeline, GaplessInfo, GaplessMode, GaplessTrimmer,
    probe_file, ProbedSource, StereoResampler,
};
pub use buffer::{AudioConsumer, AudioProducer, BoundedAudioTransport, PlayheadTracker};
pub use sink::{AudioSource, CpalBackend, NullSink, OutputBackend, WavSink};
pub use mixer::{CrossfadeState, DualSlotMixer, SlotId, SlotState, VoiceSlot};
pub use dsp::{
    BiquadFilter, DspConfig, DspPipeline, EqProfile, EqualizerChain, KaraokeProcessor,
    ReplayGainProcessor, SoundProfileStage, TruePeakLimiter, EQ_CENTER_FREQUENCIES, EQ_DEFAULT_Q,
    EQ_ISO_FREQUENCIES, EQ_ISO_Q, EQ_LEGACY_FREQUENCIES, EQ_LEGACY_Q,
};
#[allow(deprecated)]
pub use dsp::PeakLimiter;


