//! Real-Codec Verification Suite (Software Gate).
//!
//! Validates:
//! 1. FLAC 16-bit & 24-bit decode null-test against reference PCM.
//! 2. ALAC 16-bit decode null-test against reference PCM.
//! 3. LAME MP3 decode parity against ffmpeg reference f32le raw PCM.
//! 4. AAC-LC decode parity against ffmpeg reference f32le raw PCM.
//! 5. Real LAME MP3 split-pair same-decoder cancellation:
//!    Verifies that dual-slot mixer boundary splice produces sample-exact
//!    continuity with zero missing or duplicated samples compared to
//!    concatenated independent gapless decodes.

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::decoder::DecoderPipeline;
use engine_lib::mixer::{DualSlotMixer, SlotId};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;
use engine_testkit::c1_null_test::{read_wav_f32_samples, NullTestAuditor};
use engine_testkit::c2_splice_audit::SpliceAuditor;

fn find_fixture(name: &str) -> std::path::PathBuf {
    let p1 = std::path::Path::new("target/test_fixtures").join(name);
    if p1.exists() {
        return p1;
    }
    let p2 = std::path::Path::new("../../target/test_fixtures").join(name);
    if p2.exists() {
        return p2;
    }
    panic!("Fixture not found: {}", name);
}

fn decode_file_to_f32_pcm<P: AsRef<Path>>(path: P) -> (AudioSpec, Vec<f32>) {
    let mut pipeline = DecoderPipeline::open(path).expect("Pipeline open must succeed");
    let spec = pipeline.spec();
    let mut all_samples = Vec::new();

    while let Ok(Some(samples)) = pipeline.decode_next() {
        all_samples.extend_from_slice(samples);
    }

    (spec, all_samples)
}

fn read_raw_f32le<P: AsRef<Path>>(path: P) -> Vec<f32> {
    let mut file = File::open(path).expect("Raw file must exist");
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).expect("Read raw bytes");

    let mut samples = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.chunks_exact(4) {
        let val = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        samples.push(val);
    }
    samples
}

#[test]
fn test_flac_16_and_24_lossless_null_test() {
    let wav_path = find_fixture("ref_440hz_3s.wav");
    let flac16_path = find_fixture("flac16_stereo.flac");
    let flac24_path = find_fixture("flac24_stereo.flac");

    let (_ref_spec, ref_pcm) = read_wav_f32_samples(wav_path).unwrap();

    // 1. FLAC 16-bit
    let (spec16, pcm16) = decode_file_to_f32_pcm(flac16_path);
    assert_eq!(spec16.sample_rate, 48000);
    let report16 = NullTestAuditor::evaluate_with_tolerance(&pcm16, &ref_pcm, 1e-4);
    println!("FLAC-16 Null Report: {}", report16.summary());
    assert!(
        report16.is_null,
        "FLAC 16-bit decode diverged beyond quantization error: max_diff={}",
        report16.max_diff
    );

    // 2. FLAC 24-bit
    let (spec24, pcm24) = decode_file_to_f32_pcm(flac24_path);
    assert_eq!(spec24.sample_rate, 48000);
    let report24 = NullTestAuditor::evaluate_with_tolerance(&pcm24, &ref_pcm, 1e-6);
    println!("FLAC-24 Null Report: {}", report24.summary());
    assert!(
        report24.is_null,
        "FLAC 24-bit decode diverged from reference PCM: max_diff={}",
        report24.max_diff
    );
}

#[test]
fn test_alac_16_lossless_null_test() {
    let wav_path = find_fixture("ref_440hz_3s.wav");
    let alac16_path = find_fixture("alac16_stereo.m4a");

    let (_ref_spec, ref_pcm) = read_wav_f32_samples(wav_path).unwrap();
    let (spec, alac_pcm) = decode_file_to_f32_pcm(alac16_path);
    assert_eq!(spec.sample_rate, 48000);

    let report = NullTestAuditor::evaluate_with_tolerance(&alac_pcm, &ref_pcm, 1e-4);
    println!("ALAC-16 Null Report: {}", report.summary());
    assert!(
        report.is_null,
        "ALAC 16-bit decode diverged: max_diff={}",
        report.max_diff
    );
}

#[test]
fn test_mp3_lame_decode_parity_with_ffmpeg_reference() {
    let mp3_path = find_fixture("lame_stereo.mp3");
    let ffmpeg_raw_path = find_fixture("lame_ffmpeg_ref.raw");

    let (_spec, symphonia_pcm) = decode_file_to_f32_pcm(mp3_path);
    let ffmpeg_pcm = read_raw_f32le(ffmpeg_raw_path);

    // Ensure sample stream is populated and closely aligned
    assert!(!symphonia_pcm.is_empty());
    assert!(!ffmpeg_pcm.is_empty());
    // Lengths must agree within 5%: prefix-only comparison previously let
    // truncated decodes pass.
    let len_ratio = symphonia_pcm.len() as f64 / ffmpeg_pcm.len().max(1) as f64;
    assert!(
        (0.95..=1.05).contains(&len_ratio),
        "MP3 decode length diverged: symphonia={} ffmpeg={}",
        symphonia_pcm.len(),
        ffmpeg_pcm.len()
    );

    // Compare min length
    let compare_len = symphonia_pcm.len().min(ffmpeg_pcm.len());
    let mut sum_sq_diff = 0.0f64;
    for i in 0..compare_len {
        let diff = (symphonia_pcm[i] - ffmpeg_pcm[i]) as f64;
        sum_sq_diff += diff * diff;
    }
    let rms_diff = (sum_sq_diff / compare_len as f64).sqrt();
    println!("MP3 Symphonia vs FFmpeg RMS difference: {:.6e}", rms_diff);

    // Filterbank implementation difference between Symphonia minimp3 and ffmpeg is tiny (< 0.05)
    assert!(
        rms_diff < 0.05,
        "MP3 decode diverged significantly from FFmpeg reference: rms={}",
        rms_diff
    );
}

#[test]
fn test_aac_lc_decode_parity_with_ffmpeg_reference() {
    let aac_path = find_fixture("aac_stereo.m4a");
    let ffmpeg_raw_path = find_fixture("aac_ffmpeg_ref.raw");

    let (_spec, symphonia_pcm) = decode_file_to_f32_pcm(aac_path);
    let ffmpeg_pcm = read_raw_f32le(ffmpeg_raw_path);

    assert!(!symphonia_pcm.is_empty());
    assert!(!ffmpeg_pcm.is_empty());

    // Symphonia keeps container initial_padding (~1024 frames) while ffmpeg
    // strips it, but the exact offset is version-sensitive. Try candidate
    // alignments and keep the best RMS instead of hard-coding 1024*2.
    let rms_for_offset = |offset: usize| -> f64 {
        if offset >= symphonia_pcm.len() {
            return f64::INFINITY;
        }
        let aligned = &symphonia_pcm[offset..];
        let compare_len = aligned.len().min(ffmpeg_pcm.len());
        if compare_len == 0 {
            return f64::INFINITY;
        }
        let mut sum_sq_diff = 0.0f64;
        for i in 0..compare_len {
            let diff = (aligned[i] - ffmpeg_pcm[i]) as f64;
            sum_sq_diff += diff * diff;
        }
        (sum_sq_diff / compare_len as f64).sqrt()
    };
    let candidates = [0usize, 1024 * 2, 2048 * 2];
    let rms_diff = candidates
        .iter()
        .map(|&o| rms_for_offset(o))
        .fold(f64::INFINITY, f64::min);
    println!("AAC-LC Symphonia vs FFmpeg RMS difference: {:.6e}", rms_diff);

    assert!(
        rms_diff < 0.05,
        "AAC decode diverged from FFmpeg reference: rms={}",
        rms_diff
    );
}

#[test]
fn test_real_lame_split_pair_same_decoder_cancellation() {
    let part1_path = find_fixture("split_part1.mp3");
    let part2_path = find_fixture("split_part2.mp3");

    // Missing gapless fixtures must fail loudly, not silently pass: an early
    // return previously turned this gate green on machines without fixtures.
    assert!(
        part1_path.exists() && part2_path.exists(),
        "Gapless split fixtures missing: split_part1.mp3 / split_part2.mp3"
    );

    // 1. Independent decodes with same decoder (Symphonia + GaplessTrimmer)
    let (spec, pcm1) = decode_file_to_f32_pcm(part1_path);
    let (_spec2, pcm2) = decode_file_to_f32_pcm(part2_path);

    let mut concatenated_reference = Vec::with_capacity(pcm1.len() + pcm2.len());
    concatenated_reference.extend_from_slice(&pcm1);
    concatenated_reference.extend_from_slice(&pcm2);

    let split_point = pcm1.len();

    // 2. Play both consecutive tracks through DualSlotMixer across gapless transition
    let mut mixer = DualSlotMixer::new();

    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 3.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    let _ = prod_a.push_with_backpressure(&pcm1, &stop_a);
    stop_a.store(true, std::sync::atomic::Ordering::Relaxed);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);

    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 3.0);
    let stop_b = Arc::new(AtomicBool::new(false));
    let _ = prod_b.push_with_backpressure(&pcm2, &stop_b);
    stop_b.store(true, std::sync::atomic::Ordering::Relaxed);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();

    let mut mixer_stream = vec![0.0f32; concatenated_reference.len()];
    let rendered = mixer.render(&mut mixer_stream);
    assert_eq!(rendered, concatenated_reference.len());

    // 3. Same-decoder cancellation audit across splice boundary
    let report = SpliceAuditor::audit(
        &mixer_stream,
        &concatenated_reference,
        split_point,
        512,
        1e-6,
    );

    println!("Real LAME Same-Decoder Cancellation Report: {}", report.summary());
    assert!(
        report.is_seamless,
        "LAME gapless splice boundary failed: delta={}, boundary_div={}",
        report.sample_count_delta, report.boundary_window_max_divergence
    );
    assert_eq!(report.sample_count_delta, 0, "No frames dropped or duplicated");
    assert_eq!(report.boundary_window_max_divergence, 0.0, "Zero boundary divergence across splice");
}
