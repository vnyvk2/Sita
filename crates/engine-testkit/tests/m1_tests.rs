//! Milestone 1 Integration Tests:
//! - Feature 1: Cargo Workspace Setup (verified via compilation)
//! - Feature 2: OutputBackend Trait
//! - Feature 3: AudioSpec & Types
//! - Feature 4: Symphonia Probing & Decoder
//! - Feature 5: Unsupported Profile Rejection (HE-AAC with SBR/PS)
//! - Feature 6: Bounded SPSC Ring Buffer
//! - Feature 7: Monotonic Sample Playhead
//! - Feature 8: Continuous Silence Pause
//! - Feature 9: WavSink Offline Sink
//! - Feature 10: NullSink Headless Sink
//! - Feature 11: C1 Decode Null-Test Harness
//! - Feature 12: Synthetic Test Generator

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tempfile::NamedTempFile;

use engine_lib::buffer::{BoundedAudioTransport, PlayheadTracker};
use engine_lib::decoder::{inspect_aac_audio_specific_config, DecoderPipeline};
use engine_lib::sink::{NullSink, OutputBackend, WavSink};
use engine_lib::types::{AudioSpec, DecodeError};

use engine_testkit::c1_null_test::{read_wav_f32_samples, run_c1_null_test_on_pcm};
use engine_testkit::generator::{
    ImpulseGenerator, SignalGenerator, SignalMetrics, SilenceGenerator, SineGenerator,
    SquareGenerator,
};
use engine_testkit::wav_fixture::WavFixtureBuilder;

#[test]
fn test_synthetic_sine_generator() {
    let mut gen = SineGenerator::new(1000.0, 44100, 0.8, 2);
    let pcm = gen.generate_duration(0.1);

    // 0.1s at 44100Hz stereo = 4410 frames * 2 channels = 8820 samples
    assert_eq!(pcm.len(), 8820);

    let max_amp = SignalMetrics::peak_amplitude(&pcm);
    assert!((max_amp - 0.8).abs() < 1e-3, "Peak amplitude must match configured 0.8");

    // Dual-channel check: L[n] == R[n]
    for chunk in pcm.chunks_exact(2) {
        assert_eq!(chunk[0], chunk[1], "SineGenerator must produce identical L and R samples");
    }
}

#[test]
fn test_synthetic_square_generator() {
    let mut gen = SquareGenerator::new(1000.0, 48000, 0.75, 2);
    let pcm = gen.generate_duration(0.01);

    for &sample in &pcm {
        assert!(
            (sample - 0.75).abs() < 1e-6 || (sample + 0.75).abs() < 1e-6,
            "Square wave samples must strictly equal +A or -A"
        );
    }
}

#[test]
fn test_synthetic_impulse_generator() {
    let mut gen = ImpulseGenerator::new(100, 44100, 1.0, 1);
    let pcm = gen.generate_samples(300);

    for (i, &s) in pcm.iter().enumerate() {
        if i % 100 == 0 {
            assert_eq!(s, 1.0, "Impulse must be 1.0 at index {}", i);
        } else {
            assert_eq!(s, 0.0, "Impulse must be 0.0 off-pulse at index {}", i);
        }
    }
}

#[test]
fn test_synthetic_silence_generator() {
    let mut gen = SilenceGenerator::new(44100, 2);
    let pcm = gen.generate_duration(0.5);

    assert_eq!(pcm.len(), 44100);
    assert!(pcm.iter().all(|&s| s == 0.0f32));
    assert_eq!(SignalMetrics::peak_amplitude(&pcm), 0.0);
}

#[test]
fn test_wav_f32_serialization_roundtrip() {
    let temp_wav = NamedTempFile::new().unwrap();
    let mut gen = SineGenerator::new(1000.0, 44100, 0.8, 2);
    let original_pcm = gen.generate_duration(0.05);

    let fixture = WavFixtureBuilder::new_f32_stereo(44100).append_samples(&original_pcm);
    fixture.write_to_file(temp_wav.path()).unwrap();

    let (spec, read_samples) = read_wav_f32_samples(temp_wav.path()).unwrap();
    assert_eq!(spec.sample_rate, 44100);
    assert_eq!(spec.channels, 2);
    assert_eq!(spec.bits_per_sample, 32);

    assert_eq!(original_pcm.len(), read_samples.len());

    let report = run_c1_null_test_on_pcm(&original_pcm, &read_samples, 44100, 2, 0.0).unwrap();
    assert!(report.is_null, "WAV roundtrip must have null_diff == 0.0: {:?}", report);
    assert_eq!(report.max_diff, 0.0);
}

#[test]
fn test_c1_null_test_wav_pipeline() {
    // 1. Generate reference signal
    let mut gen = SineGenerator::new(1000.0, 44100, 0.8, 2);
    let ref_pcm = gen.generate_duration(0.2);

    let input_wav = NamedTempFile::new().unwrap();
    let fixture = WavFixtureBuilder::new_f32_stereo(44100).append_samples(&ref_pcm);
    fixture.write_to_file(input_wav.path()).unwrap();

    let output_wav = NamedTempFile::new().unwrap();

    // 2. Worker pipeline invocation:
    // Decode input_wav using engine-lib Symphonia DecoderPipeline -> WavSink
    let mut pipeline = DecoderPipeline::open(input_wav.path()).unwrap();
    let mut sink = WavSink::new(output_wav.path());
    let spec = pipeline.spec();

    sink.open(spec).unwrap();
    sink.start().unwrap();

    while let Some(decoded_chunk) = pipeline.decode_next().unwrap() {
        sink.write_samples(decoded_chunk).unwrap();
    }
    sink.stop().unwrap();

    // 3. Read back rendered WAV and execute C1 null-test
    let (_, rendered_pcm) = read_wav_f32_samples(output_wav.path()).unwrap();
    let report = run_c1_null_test_on_pcm(&ref_pcm, &rendered_pcm, 44100, 2, 0.0).unwrap();

    println!("{}", report.summary());
    assert!(report.is_null, "C1 Acceptance Criterion failed: {:?}", report);
    assert_eq!(report.max_diff, 0.0, "C1 mandates bit-identical decode (null diff == 0)");
}

#[test]
fn test_bounded_ring_buffer_streaming() {
    let spec = AudioSpec::new_f32_stereo(44100);
    let (mut producer, mut consumer) = BoundedAudioTransport::create(&spec, 2.0);

    let test_data = vec![0.1f32, -0.2, 0.3, -0.4, 0.5, -0.6];
    let written = producer.try_push(&test_data);
    assert_eq!(written, 6);
    assert_eq!(consumer.available_samples(), 6);

    let mut read_buf = vec![0.0f32; 6];
    let read = consumer.pop_slice(&mut read_buf);
    assert_eq!(read, 6);
    assert_eq!(read_buf, test_data);
    assert_eq!(consumer.available_samples(), 0);
}

#[test]
fn test_producer_backpressure_with_stop_flag() {
    let spec = AudioSpec::new_f32_stereo(8000);
    let (mut producer, _consumer) = BoundedAudioTransport::create(&spec, 2.0); // capacity 32,000

    let stop_flag = Arc::new(AtomicBool::new(false));
    let oversized_data = vec![0.0f32; 40000];

    let stop_clone = Arc::clone(&stop_flag);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(50));
        stop_clone.store(true, Ordering::Release);
    });

    let start = std::time::Instant::now();
    let result = producer.push_with_backpressure(&oversized_data, &stop_flag);
    let elapsed = start.elapsed();

    assert!(result.is_ok());
    assert!(elapsed.as_millis() >= 40, "Backpressure loop must yield/sleep");
    assert!(stop_flag.load(Ordering::Relaxed));
}

#[test]
fn test_null_sink_consumption_and_telemetry() {
    let mut sink = NullSink::new();
    let spec = AudioSpec::new_f32_stereo(48000);

    sink.open(spec).unwrap();
    assert!(sink.is_open());
    assert!(!sink.is_running());

    sink.start().unwrap();
    assert!(sink.is_running());

    let test_chunk = vec![0.1f32; 8192];
    sink.consume_samples(&test_chunk);

    let stats = sink.stats();
    assert_eq!(stats.total_samples_consumed, 8192);
    assert_eq!(stats.total_frames_consumed, 4096);
    assert!((stats.position_seconds - (4096.0 / 48000.0)).abs() < 1e-6);
    assert_eq!(stats.xrun_count, 0);
    assert!(!stats.is_paused);

    sink.pause().unwrap();
    assert!(!sink.is_running());
    let stats_paused = sink.stats();
    assert!(stats_paused.is_paused);

    sink.stop().unwrap();
    assert!(!sink.is_open());
}

#[test]
fn test_he_aac_rejection_logic() {
    // AOT 5 (Explicit SBR): top 5 bits: 5 << 3 = 40 (0x28)
    let sbr_asc = [0x28, 0x00];
    let result = inspect_aac_audio_specific_config(&sbr_asc);
    assert!(result.is_err());
    if let Err(DecodeError::UnsupportedProfile(msg)) = result {
        assert!(msg.contains("HE-AAC v1"));
    } else {
        panic!("Expected UnsupportedProfile error for SBR");
    }

    // AOT 29 (Explicit PS): AOT = 29 -> 29 << 3 = 232 (0xE8)
    let ps_asc = [0xE8, 0x00];
    let result_ps = inspect_aac_audio_specific_config(&ps_asc);
    assert!(result_ps.is_err());
    if let Err(DecodeError::UnsupportedProfile(msg)) = result_ps {
        assert!(msg.contains("HE-AAC v2"));
    } else {
        panic!("Expected UnsupportedProfile error for PS");
    }

    // Standard AAC-LC (AOT 2)
    // AOT 2 (0b00010), 44.1kHz (0b0100), Stereo (0b0010) -> [0x12, 0x10]
    let aac_lc_asc = [0x12, 0x10];
    let lc_result = inspect_aac_audio_specific_config(&aac_lc_asc);
    assert!(lc_result.is_ok());
}

#[test]
fn test_playhead_monotonicity() {
    let spec = AudioSpec::new_f32_stereo(44100);
    let stats = Arc::new(engine_lib::types::SharedSinkStats::new());
    let playhead = PlayheadTracker::new(spec, Arc::clone(&stats));

    assert_eq!(playhead.position_frames(), 0);
    assert_eq!(playhead.position_seconds(), 0.0);

    // Consume 44100 frames (88200 samples)
    stats.record_consumption(88200, 2);
    assert_eq!(playhead.position_frames(), 44100);
    assert!((playhead.position_seconds() - 1.0).abs() < 1e-6);

    // Consume another 22050 frames (44100 samples)
    stats.record_consumption(44100, 2);
    assert_eq!(playhead.position_frames(), 66150);
    assert!((playhead.position_seconds() - 1.5).abs() < 1e-6);

    // Seek to 10.0 seconds (441000 frames)
    playhead.set_seek_target_frame(441000);
    assert_eq!(playhead.position_frames(), 441000);
    assert!((playhead.position_seconds() - 10.0).abs() < 1e-6);

    // Consume 44100 frames after seek
    stats.record_consumption(88200, 2);
    assert_eq!(playhead.position_frames(), 485100);
    assert!((playhead.position_seconds() - 11.0).abs() < 1e-6);
}
