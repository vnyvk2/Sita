//! Multi-format audio decoding subsystem for the Nora Native Audio Engine.
//!
//! Provides container probing, codec instantiation, graceful unsupported profile rejection
//! (e.g. HE-AAC with SBR/PS), planar-to-interleaved f32 normalization, and gapless trimming.

pub mod gapless;
pub mod pipeline;
pub mod probe;
pub mod profile;
pub mod resample;

pub use gapless::{parse_itunsmpb, parse_lame_tag, GaplessInfo, GaplessMode, GaplessTrimmer};
pub use pipeline::DecoderPipeline;
pub use probe::{probe_file, probe_media_stream, ProbedSource};
pub use profile::{inspect_aac_audio_specific_config, validate_codec_profile};
pub use resample::StereoResampler;

