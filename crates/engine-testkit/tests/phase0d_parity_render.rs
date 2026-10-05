//! Phase 0D Parity Renderer: Renders reference signals through the Rust engine
//! into target/parity_artifacts/*.wav for mathematical comparison against WebAudio.

use std::path::{Path, PathBuf};

use engine_lib::decoder::{DecoderPipeline, StereoResampler};
use engine_lib::dsp::DspPipeline;
use engine_lib::sink::{OutputBackend, WavSink};
use engine_lib::types::AudioSpec;

fn find_fixtures_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("../../target/test_fixtures"),
        PathBuf::from("target/test_fixtures"),
    ];
    candidates
        .iter()
        .find(|p| p.exists())
        .expect("target/test_fixtures directory not found")
        .clone()
}

fn find_artifacts_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("../../target/parity_artifacts"),
        PathBuf::from("target/parity_artifacts"),
    ];
    candidates
        .iter()
        .find(|p| p.exists())
        .expect("target/parity_artifacts directory not found")
        .clone()
}

fn decode_and_render_to_wav(
    input_file: &Path,
    output_file: &Path,
    target_sample_rate: u32,
    bypass_dsp: bool,
) {
    let mut decoder = DecoderPipeline::open(input_file).expect("Failed to open input audio");
    let in_spec = decoder.spec();

    let resampler = if in_spec.sample_rate != target_sample_rate {
        Some(StereoResampler::new(in_spec.sample_rate, target_sample_rate).expect("Resampler failed"))
    } else {
        None
    };

    let mut dsp = DspPipeline::new(target_sample_rate as f32);
    dsp.set_bypass(bypass_dsp);

    let out_spec = AudioSpec::new_f32_stereo(target_sample_rate);
    let mut sink = WavSink::new(output_file);
    sink.open(out_spec).expect("Failed to open WavSink");
    sink.start().expect("Failed to start WavSink");

    let mut decoded_all = Vec::new();
    while let Ok(Some(packet)) = decoder.decode_next() {
        decoded_all.extend_from_slice(packet);
    }

    let mut processed_samples = Vec::new();
    if let Some(mut r) = resampler {
        r.push_interleaved(&decoded_all, &mut processed_samples).unwrap();
        r.flush(&mut processed_samples).unwrap();
    } else {
        processed_samples = decoded_all;
    }

    dsp.process(&mut processed_samples);
    sink.write_samples(&processed_samples).expect("Failed to write samples");
    sink.stop().expect("Failed to stop WavSink");

    println!(
        "Rendered {:?} -> {:?} (frames: {}, rate: {}Hz)",
        input_file.file_name().unwrap(),
        output_file.file_name().unwrap(),
        processed_samples.len() / 2,
        target_sample_rate
    );
}

#[test]
fn test_render_all_parity_reference_artifacts() {
    let fixtures_dir = find_fixtures_dir();
    let artifacts_dir = find_artifacts_dir();

    println!("============================================================");
    println!("PHASE 0D: RENDERING RUST NATIVE ENGINE REFERENCE ARTIFACTS");
    println!("============================================================");

    // 1. Same-rate passthrough: ref_440hz_3s.wav (48kHz) -> 48kHz StudioReference
    decode_and_render_to_wav(
        &fixtures_dir.join("ref_440hz_3s.wav"),
        &artifacts_dir.join("rust_ref_48k.wav"),
        48000,
        true, // StudioReference (bypass)
    );

    // 2. Studio Master 24-bit FLAC: flac24_stereo.flac (48kHz) -> 48kHz StudioReference
    decode_and_render_to_wav(
        &fixtures_dir.join("flac24_stereo.flac"),
        &artifacts_dir.join("rust_flac24_48k.wav"),
        48000,
        true,
    );

    // 3. Cross-rate Resampling: ref_440hz_3s_44100.wav (44.1kHz) -> 48kHz StudioReference
    decode_and_render_to_wav(
        &fixtures_dir.join("ref_440hz_3s_44100.wav"),
        &artifacts_dir.join("rust_resampled_48k.wav"),
        48000,
        true,
    );

    // 4. Phase 0C Dynamic Test Signal (4.0 seconds, quiet/nominal/hot/tail)
    let sr = 48000;
    let dur = 4.0;
    let num_frames = (sr as f64 * dur) as usize;
    let mut dynamic_signal = vec![0.0f32; num_frames * 2];

    for i in 0..num_frames {
        let t = i as f32 / sr as f32;
        let mut amp_db = -24.0f32;
        if (1.0..2.5).contains(&t) {
            amp_db = -12.0;
        }
        if (2.5..3.2).contains(&t) {
            amp_db = -1.0;
        }
        if t >= 3.2 {
            amp_db = -20.0;
        }
        let amp = 10.0f32.powf(amp_db / 20.0);
        let sample = amp
            * (0.6 * (2.0 * std::f32::consts::PI * 440.0 * t).sin()
                + 0.25 * (2.0 * std::f32::consts::PI * 880.0 * t).sin()
                + 0.10 * (2.0 * std::f32::consts::PI * 1320.0 * t).sin()
                + 0.05 * (2.0 * std::f32::consts::PI * 2640.0 * t).sin());
        dynamic_signal[i * 2] = sample;
        dynamic_signal[i * 2 + 1] = sample;
    }

    // 4a. Dynamic Signal in StudioReference (bypass)
    let out_spec = AudioSpec::new_f32_stereo(sr);
    let mut sink_dyn_ref = WavSink::new(artifacts_dir.join("rust_dynamic_48k.wav"));
    sink_dyn_ref.open(out_spec).unwrap();
    sink_dyn_ref.start().unwrap();
    let mut dyn_ref_samples = dynamic_signal.clone();
    let mut dsp_bypass = DspPipeline::new(sr as f32);
    dsp_bypass.set_bypass(true);
    dsp_bypass.process(&mut dyn_ref_samples);
    sink_dyn_ref.write_samples(&dyn_ref_samples).unwrap();
    sink_dyn_ref.stop().unwrap();
    println!("Rendered rust_dynamic_48k.wav (StudioReference bypass)");

    // 4b. Dynamic Signal with Limiter active
    let mut sink_dyn_lim = WavSink::new(artifacts_dir.join("rust_dynamic_limiter_48k.wav"));
    sink_dyn_lim.open(out_spec).unwrap();
    sink_dyn_lim.start().unwrap();
    let mut dyn_lim_samples = dynamic_signal.clone();
    let mut dsp_lim = DspPipeline::new(sr as f32);
    dsp_lim.set_bypass(false);
    dsp_lim.process(&mut dyn_lim_samples);
    sink_dyn_lim.write_samples(&dyn_lim_samples).unwrap();
    sink_dyn_lim.stop().unwrap();
    println!("Rendered rust_dynamic_limiter_48k.wav (Limiter active)");
}
