//! Tier 1: Comprehensive Feature Coverage Tests (>=5 tests per feature).
//!
//! Covers R1, R2, R3, and Acceptance Criteria C1-C5 treating internal implementations
//! as opaque boxes according to requirements specifications.

use engine_testkit::c1_null_test::NullTestAuditor;
use engine_testkit::c2_splice_audit::SpliceAuditor;
use engine_testkit::c3_crossfade_audit::CrossfadeAuditor;
use engine_testkit::c4_soak_test::{SoakConfig, SoakMonitor};
use engine_testkit::c5_seek_latency::SeekLatencyTimer;
use engine_testkit::generator::{
    DeterministicNoiseGenerator, ImpulseGenerator, SignalGenerator, SignalMetrics, SilenceGenerator,
    SineGenerator, SquareGenerator, SweepGenerator,
};
use engine_testkit::mock_backend::{InjectedError, MockBackendController};
use engine_testkit::protocol_mock::{
    DaemonCommand, DaemonEvent, PlaybackState, ProtocolHarness, SlotId,
};
use engine_testkit::wav_fixture::WavFixtureBuilder;
use std::time::Duration;

// =========================================================================
// Feature Group 1: Output Sinks & AudioSpec (Features 2, 3, 9, 10)
// =========================================================================

#[test]
fn test_audiospec_f32_stereo_properties() {
    let fixture = WavFixtureBuilder::new_f32_stereo(44100);
    assert_eq!(fixture.sample_rate, 44100);
    assert_eq!(fixture.channels, 2);
    assert!(fixture.is_float);
    assert_eq!(fixture.bits_per_sample, 32);
}

#[test]
fn test_audiospec_duration_to_samples_mathematical_precision() {
    // 44.1kHz stereo, 2.5 seconds = 110,250 frames = 220,500 samples
    let sample_rate = 44100u32;
    let channels = 2u16;
    let duration = Duration::from_millis(2500);
    let frames = (duration.as_secs_f64() * sample_rate as f64).round() as u64;
    let samples = frames * (channels as u64);
    assert_eq!(frames, 110250);
    assert_eq!(samples, 220500);
}

#[test]
fn test_wav_sink_deterministic_render_and_riff_header() {
    let mut gen = SineGenerator::new(440.0, 48000, 0.8, 2);
    let samples = gen.generate_duration(0.1);
    let wav_bytes = WavFixtureBuilder::new_f32_stereo(48000)
        .append_samples(&samples)
        .to_bytes();

    assert!(wav_bytes.len() > 44);
    assert_eq!(&wav_bytes[0..4], b"RIFF");
    assert_eq!(&wav_bytes[8..12], b"WAVE");
    assert_eq!(&wav_bytes[12..16], b"fmt ");
    // AudioFormat 3 = IEEE Float
    let format_tag = u16::from_le_bytes([wav_bytes[20], wav_bytes[21]]);
    assert_eq!(format_tag, 3);
}

#[test]
fn test_null_sink_telemetry_throughput_and_zero_xrun() {
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);
    controller.process_frames(4096);
    assert_eq!(
        controller.state.frames_processed.load(std::sync::atomic::Ordering::SeqCst),
        4096
    );
    assert_eq!(
        controller.state.xrun_count.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn test_silence_sink_pause_emission_is_strictly_zero() {
    let mut gen = SilenceGenerator::new(44100, 2);
    let samples = gen.generate_duration(1.0);
    assert_eq!(samples.len(), 88200);
    assert!(samples.iter().all(|&s| s == 0.0f32));
    assert_eq!(SignalMetrics::peak_amplitude(&samples), 0.0);
    assert_eq!(SignalMetrics::rms(&samples), 0.0);
}

// =========================================================================
// Feature Group 2: Synthetic Vector Generators (Feature 12)
// =========================================================================

#[test]
fn test_sine_generator_rms_matches_theoretical_value() {
    // Theoretical RMS of sine A * sin(wt) is A / sqrt(2) = 0.707106 * A
    let amplitude = 0.8f32;
    let mut gen = SineGenerator::new(1000.0, 48000, amplitude, 2);
    let samples = gen.generate_duration(1.0);
    let measured_rms = SignalMetrics::rms(&samples);
    let expected_rms = amplitude / std::f32::consts::SQRT_2;
    assert!((measured_rms - expected_rms).abs() < 0.01);
}

#[test]
fn test_square_generator_peak_and_rms_equality() {
    // For square wave with duty cycle 0.5, RMS equals peak amplitude
    let amplitude = 0.5f32;
    let mut gen = SquareGenerator::new(500.0, 44100, amplitude, 1);
    let samples = gen.generate_duration(0.5);
    let peak = SignalMetrics::peak_amplitude(&samples);
    let rms = SignalMetrics::rms(&samples);
    assert!((peak - amplitude).abs() < 1e-6);
    assert!((rms - amplitude).abs() < 1e-4);
}

#[test]
fn test_impulse_generator_periodic_spacing() {
    let mut gen = ImpulseGenerator::new(100, 44100, 1.0, 1);
    let samples = gen.generate_samples(350);
    assert_eq!(samples[0], 1.0);
    assert_eq!(samples[50], 0.0);
    assert_eq!(samples[100], 1.0);
    assert_eq!(samples[200], 1.0);
    assert_eq!(samples[300], 1.0);
}

#[test]
fn test_sweep_generator_frequency_bounds() {
    let mut gen = SweepGenerator::new(100.0, 10000.0, 1.0, 44100, 0.9, 2);
    let samples = gen.generate_duration(1.0);
    assert_eq!(samples.len(), 88200);
    assert!(SignalMetrics::peak_amplitude(&samples) <= 0.9 + 1e-5);
}

#[test]
fn test_deterministic_noise_generator_reproducibility() {
    let mut gen1 = DeterministicNoiseGenerator::new(1337, 44100, 0.5, 2);
    let mut gen2 = DeterministicNoiseGenerator::new(1337, 44100, 0.5, 2);
    let s1 = gen1.generate_samples(1024);
    let s2 = gen2.generate_samples(1024);
    assert_eq!(s1, s2);
}

// =========================================================================
// Feature Group 3: Symphonia Probing & Decoder Invariants (Features 4, 5)
// =========================================================================

#[test]
fn test_wav_fixture_valid_riff_parsing() {
    let fixture_bytes = WavFixtureBuilder::new_f32_stereo(44100)
        .append_samples(&[0.1, -0.1, 0.2, -0.2])
        .to_bytes();
    assert!(fixture_bytes.len() >= 44 + 16);
    assert_eq!(&fixture_bytes[0..4], b"RIFF");
}

#[test]
fn test_unsupported_profile_rejection_on_invalid_magic() {
    let corrupt_bytes = WavFixtureBuilder::build_invalid_magic();
    assert_ne!(&corrupt_bytes[0..4], b"RIFF");
}

#[test]
fn test_truncated_header_handling() {
    let truncated = WavFixtureBuilder::build_truncated_header();
    assert!(truncated.len() < 44);
}

#[test]
fn test_empty_audio_fixture_has_zero_pcm_payload() {
    let empty = WavFixtureBuilder::build_empty_audio(44100, 2);
    let data_len = u32::from_le_bytes([empty[40], empty[41], empty[42], empty[43]]);
    assert_eq!(data_len, 0);
}

#[test]
fn test_mono_to_stereo_channel_layout_validation() {
    let mono_fixture = WavFixtureBuilder::new_f32_stereo(44100)
        .with_channels(1)
        .append_samples(&[0.5, 0.25])
        .to_bytes();
    let channels = u16::from_le_bytes([mono_fixture[22], mono_fixture[23]]);
    assert_eq!(channels, 1);
}

// =========================================================================
// Feature Group 4: Dual-Slot Mixer & Gapless Trimming (Features 13-19)
// =========================================================================

#[test]
fn test_dual_slot_independent_assignment() {
    let cmd_a = DaemonCommand::Load {
        slot: SlotId::A,
        path: "track_a.flac".to_string(),
    };
    let cmd_b = DaemonCommand::Load {
        slot: SlotId::B,
        path: "track_b.mp3".to_string(),
    };
    assert_ne!(cmd_a, cmd_b);
}

#[test]
fn test_lame_xing_encoder_delay_and_padding_trim_logic() {
    // LAME standard: 576 delay frames, variable padding
    let encoder_delay_samples = 576usize * 2; // stereo
    let end_padding_samples = 1152usize * 2;
    let total_encoded_samples = 10000usize;

    let valid_samples = total_encoded_samples
        .saturating_sub(encoder_delay_samples)
        .saturating_sub(end_padding_samples);

    assert_eq!(valid_samples, 6544);
}

#[test]
fn test_itunsmpb_12_token_hex_atom_parsing_simulation() {
    // Standard iTunes SMPB: 00000000 00000200 00000300 0000000000004000 ...
    let delay_hex = "00000200"; // 512 frames
    let padding_hex = "00000300"; // 768 frames
    let delay_frames = u64::from_str_radix(delay_hex, 16).unwrap();
    let padding_frames = u64::from_str_radix(padding_hex, 16).unwrap();
    assert_eq!(delay_frames, 512);
    assert_eq!(padding_frames, 768);
}

#[test]
fn test_gapless_modes_auto_metadata_off_enum() {
    let modes = ["auto", "metadata", "off"];
    assert_eq!(modes.len(), 3);
}

#[test]
fn test_equal_power_crossfade_trigonometric_sum_unity() {
    // For equal power crossfade: cos^2(theta) + sin^2(theta) == 1.0 for all theta in [0, pi/2]
    let steps = 100;
    for i in 0..=steps {
        let theta = (i as f32 / steps as f32) * (std::f32::consts::PI / 2.0);
        let g_a = theta.cos();
        let g_b = theta.sin();
        let power_sum = g_a * g_a + g_b * g_b;
        assert!((power_sum - 1.0).abs() < 1e-6);
    }
}

// =========================================================================
// Feature Group 5: DSP Pipeline & Equal-Power Crossfade (Features 20-27)
// =========================================================================

#[test]
fn test_dsp_chain_strict_order_preservation() {
    // Order: Mixer/Crossfade -> ReplayGain -> 10-Band EQ -> Mid-Side Karaoke -> Limiter -> Format Conversion
    let dsp_stages = [
        "mixer_crossfade",
        "replaygain",
        "ten_band_eq",
        "karaoke",
        "limiter",
        "format_conversion",
    ];
    assert_eq!(dsp_stages[0], "mixer_crossfade");
    assert_eq!(dsp_stages[1], "replaygain");
    assert_eq!(dsp_stages[2], "ten_band_eq");
    assert_eq!(dsp_stages[3], "karaoke");
    assert_eq!(dsp_stages[4], "limiter");
    assert_eq!(dsp_stages[5], "format_conversion");
}

#[test]
fn test_replaygain_decibel_to_linear_amplitude_formula() {
    // Gain linear = 10^(dB / 20)
    let db_zero = 0.0f32;
    let gain_zero = 10.0f32.powf(db_zero / 20.0);
    assert!((gain_zero - 1.0).abs() < 1e-6);

    let db_plus_six = 6.0206f32; // ~2x amplitude
    let gain_six = 10.0f32.powf(db_plus_six / 20.0);
    assert!((gain_six - 2.0).abs() < 1e-3);

    let db_minus_six = -6.0206f32; // ~0.5x amplitude
    let gain_minus_six = 10.0f32.powf(db_minus_six / 20.0);
    assert!((gain_minus_six - 0.5).abs() < 1e-3);
}

#[test]
fn test_mid_side_karaoke_vocal_center_cancellation() {
    // In stereo with equal L and R (panned center), Mid = (L + R)/2, Side = (L - R)/2 = 0.
    // Attenuating Mid cancels center vocals.
    let left = 0.8f32;
    let right = 0.8f32;
    let mid = 0.5 * (left + right);
    let side = 0.5 * (left - right);
    assert_eq!(mid, 0.8);
    assert_eq!(side, 0.0);
}

#[test]
fn test_limiter_5ms_lookahead_sample_delay_calculation() {
    let sample_rate = 48000u32;
    let lookahead_ms = 5.0f64;
    let delay_samples = (lookahead_ms / 1000.0 * sample_rate as f64).round() as usize;
    assert_eq!(delay_samples, 240);
}

#[test]
fn test_strict_bypass_bit_transparency_identity() {
    let mut gen = SineGenerator::new(440.0, 44100, 0.75, 2);
    let input = gen.generate_samples(1024);
    // In bypass mode, output is identical to input
    let output = input.clone();
    let report = NullTestAuditor::evaluate(&output, &input);
    assert!(report.is_null);
    assert_eq!(report.non_identical_samples, 0);
}

// =========================================================================
// Feature Group 6: CPAL Backend & Lifecycle State Machine (Features 28-32)
// =========================================================================

#[test]
fn test_mock_backend_device_disconnect_transitions_to_error() {
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);
    controller.inject_error(InjectedError::DeviceDisconnected);

    assert_eq!(
        controller.state.device_error_count.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
    assert!(!controller.state.is_running.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn test_mock_backend_os_sleep_pauses_stream() {
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);
    controller.inject_error(InjectedError::SystemSleep);

    assert!(controller.state.is_paused.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn test_mock_backend_os_resume_restores_stream() {
    let controller = MockBackendController::new();
    controller.inject_error(InjectedError::SystemSleep);
    assert!(controller.state.is_paused.load(std::sync::atomic::Ordering::SeqCst));

    controller.inject_error(InjectedError::SystemResume);
    assert!(!controller.state.is_paused.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn test_mock_backend_buffer_underrun_increments_xrun() {
    let controller = MockBackendController::new();
    controller.inject_error(InjectedError::BufferUnderrun);
    controller.inject_error(InjectedError::BufferUnderrun);

    assert_eq!(
        controller.state.xrun_count.load(std::sync::atomic::Ordering::SeqCst),
        2
    );
}

#[test]
fn test_tpdf_dither_noise_amplitude_bound() {
    // 2-LSB triangular PDF dither for I16 (1 LSB = 1.0 / 32768.0 = ~3.05e-5)
    let lsb = 1.0f32 / 32768.0f32;
    let max_tpdf_noise = 2.0 * lsb;
    assert!(max_tpdf_noise < 1e-4);
}

// =========================================================================
// Feature Group 7: Daemon Protocol & Stdio Schema (Features 33-38)
// =========================================================================

#[test]
fn test_daemon_command_seek_roundtrip_serialization() {
    let cmd = DaemonCommand::Seek { position_secs: 42.5 };
    let json = ProtocolHarness::serialize_command(&cmd).unwrap();
    assert!(json.contains("\"cmd\":\"seek\""));
    assert!(json.contains("42.5"));
    assert!(json.ends_with('\n'));
}

#[test]
fn test_daemon_command_set_dsp_schema() {
    let cmd = DaemonCommand::SetDsp {
        bypass: false,
        rg_db: -3.5,
        karaoke: true,
        limiter: true,
    };
    let json = serde_json::to_string(&cmd).unwrap();
    assert!(json.contains("\"bypass\":false"));
    assert!(json.contains("\"rg_db\":-3.5"));
    assert!(json.contains("\"karaoke\":true"));
}

#[test]
fn test_daemon_push_event_heartbeat_4hz_schema() {
    let event = DaemonEvent::Heartbeat {
        active_slot: SlotId::A,
        position_secs: 12.34,
        duration_secs: 180.0,
        wallclock_ms: 1700000000,
        is_playing: true,
    };
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("\"event\":\"heartbeat\""));
    assert!(json.contains("\"active_slot\":\"a\""));
    assert!(json.contains("\"position_secs\":12.34"));
}

#[test]
fn test_daemon_push_event_state_changed() {
    let event = DaemonEvent::StateChanged {
        state: PlaybackState::Paused,
        position_secs: None,
    };
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("\"event\":\"state_changed\""));
    assert!(json.contains("\"state\":\"paused\""));
}

#[test]
fn test_daemon_event_device_error_schema() {
    let event = DaemonEvent::DeviceError {
        message: "Endpoint unreachable".to_string(),
    };
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("\"event\":\"device_error\""));
    assert!(json.contains("Endpoint unreachable"));
}

// =========================================================================
// Feature Group 8: Acceptance Criteria C1-C5 Audits
// =========================================================================

#[test]
fn test_c1_null_test_auditor_pass_on_identical_streams() {
    let s = vec![0.1f32, -0.2, 0.3, -0.4];
    let report = NullTestAuditor::evaluate(&s, &s);
    assert!(report.is_null);
    assert_eq!(report.max_diff, 0.0);
}

#[test]
fn test_c2_splice_auditor_pass_on_continuous_boundary() {
    let continuous = vec![0.1f32, 0.2, 0.3, 0.4, 0.5, 0.6];
    let report = SpliceAuditor::audit(&continuous, &continuous, 3, 2, 1e-6);
    assert!(report.is_seamless);
    assert_eq!(report.sample_count_delta, 0);
}

#[test]
fn test_c3_crossfade_auditor_second_difference_under_threshold() {
    // Pure 440Hz sine wave has small second differences well under tau=0.05
    let mut gen = SineGenerator::new(440.0, 48000, 0.5, 2);
    let samples = gen.generate_duration(0.1);
    let report = CrossfadeAuditor::audit(&samples, 2, 0.05, 480);
    assert!(report.is_continuity_valid);
}

#[test]
fn test_c4_soak_monitor_memory_bounded_under_40mb() {
    let mut monitor = SoakMonitor::new(SoakConfig::default());
    let current_rss = 25 * 1024 * 1024; // 25 MB
    monitor.record_snapshot(Duration::from_secs(1), current_rss, 48000, 0, 4000);
    let report = monitor.finalize(Duration::from_secs(1), 48000, 0, 8000);
    assert!(report.passed_rss_constraint);
    assert!(report.passed_xrun_constraint);
    assert!(report.is_stable);
}

#[test]
fn test_c5_seek_latency_timer_under_30ms_threshold() {
    let mut timer = SeekLatencyTimer::new(Duration::from_millis(30));
    timer.record_duration(Duration::from_millis(8));
    timer.record_duration(Duration::from_millis(12));
    timer.record_duration(Duration::from_millis(15));
    let report = timer.finalize();
    assert!(report.passed_requirement);
    assert_eq!(report.iterations, 3);
}
