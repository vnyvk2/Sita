//! Format probing, track discovery, and decoder instantiation via Symphonia.

use std::fs::File;
use std::path::Path;
use std::time::Duration;

use symphonia::core::codecs::{CodecParameters, Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::{get_codecs, get_probe};

use crate::decoder::profile::validate_codec_profile;
use crate::types::{AudioSpec, DecodeError, SampleType};

/// Metadata and initialized decoder handles returned from format probing.
pub struct ProbedSource {
    pub format: Box<dyn FormatReader>,
    pub decoder: Box<dyn Decoder>,
    pub track_id: u32,
    pub spec: AudioSpec,
    pub total_frames: Option<u64>,
    pub estimated_duration: Option<Duration>,
}

/// Open an audio file and probe its container, codec, and track specifications.
pub fn probe_file<P: AsRef<Path>>(path: P) -> Result<ProbedSource, DecodeError> {
    let path_ref = path.as_ref();
    let file = File::open(path_ref).map_err(DecodeError::Io)?;

    let mut hint = Hint::new();
    if let Some(ext) = path_ref.extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }

    probe_media_stream(Box::new(file), hint)
}

/// Probe a generic Seekable MediaSource stream.
pub fn probe_media_stream(
    source: Box<dyn symphonia::core::io::MediaSource>,
    hint: Hint,
) -> Result<ProbedSource, DecodeError> {
    let mss_opts = MediaSourceStreamOptions::default();
    let mss = MediaSourceStream::new(source, mss_opts);

    let format_opts = FormatOptions {
        enable_gapless: true,
        ..Default::default()
    };
    let meta_opts = MetadataOptions::default();

    let probed = get_probe()
        .format(&hint, mss, &format_opts, &meta_opts)
        .map_err(|e| DecodeError::ProbeFailed(e.to_string()))?;

    let format = probed.format;

    // Discover the primary audio track
    let track = format
        .default_track()
        .or_else(|| {
            format
                .tracks()
                .iter()
                .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        })
        .cloned()
        .ok_or(DecodeError::NoAudioTrack)?;

    let track_id = track.id;
    let params: &CodecParameters = &track.codec_params;

    // Validate profile (e.g. reject HE-AAC with SBR/PS)
    validate_codec_profile(params)?;

    // Extract AudioSpec
    let sample_rate = params
        .sample_rate
        .ok_or_else(|| DecodeError::UnsupportedFormat("Missing stream sample rate".to_string()))?;

    let channel_count = params.channels.map_or(2, |c| c.count() as u16);
    if channel_count != 1 && channel_count != 2 {
        return Err(DecodeError::UnsupportedFormat(format!(
            "Unsupported channel count: {} (supported: 1 = mono, 2 = stereo)",
            channel_count
        )));
    }

    // Force engine internal processing to Stereo F32
    // Mono streams will be automatically expanded to stereo by the decoder pipeline
    let spec = AudioSpec::new(sample_rate, 2, SampleType::F32);
    spec.validate()
        .map_err(|e| DecodeError::UnsupportedFormat(e.to_string()))?;

    // Instantiate Symphonia decoder
    let decoder_opts = DecoderOptions { verify: false };
    let decoder = get_codecs()
        .make(params, &decoder_opts)
        .map_err(|e| DecodeError::UnsupportedCodec(e.to_string()))?;

    let total_frames = params.n_frames;
    let estimated_duration = total_frames.map(|f| spec.frames_to_duration(f));

    Ok(ProbedSource {
        format,
        decoder,
        track_id,
        spec,
        total_frames,
        estimated_duration,
    })
}
