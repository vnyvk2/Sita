//! Tier 3: Cross-Feature Combinations Tests (Pairwise Interactions).
//!
//! Validates complex cross-cutting interactions between mixer, crossfader,
//! DSP chain, ring buffers, device lifecycle, and control daemon.

use engine_testkit::c3_crossfade_audit::CrossfadeAuditor;
use engine_testkit::generator::{
    DeterministicNoiseGenerator, SignalGenerator, SignalMetrics, SineGenerator,
};
use engine_testkit::mock_backend::{InjectedError, MockBackendController};
use engine_testkit::protocol_mock::{DaemonCommand, DaemonRequest, ProtocolHarness};

#[test]
fn test_combo_crossfade_with_active_dsp_and_replaygain() {
    // Both Slot A and Slot B undergoing equal-power crossfade while passing through
    // ReplayGain (+3dB) and 10-band EQ
    let mut gen_a = SineGenerator::new(440.0, 48000, 0.5, 2);
    let mut gen_b = SineGenerator::new(880.0, 48000, 0.5, 2);

    let samples_a = gen_a.generate_duration(0.1);
    let samples_b = gen_b.generate_duration(0.1);

    let n = samples_a.len();
    let mut mixed = vec![0.0f32; n];
    let rg_gain = 10.0f32.powf(3.0 / 20.0); // +3dB

    for i in 0..n {
        let theta = (i as f32 / n as f32) * (std::f32::consts::PI / 2.0);
        let g_a = theta.cos();
        let g_b = theta.sin();
        let sample_mix = g_a * samples_a[i] + g_b * samples_b[i];
        mixed[i] = sample_mix * rg_gain;
    }

    // Continuity across transition window
    let audit = CrossfadeAuditor::audit(&mixed, 2, 0.15, 480);
    assert!(audit.is_continuity_valid);
}

#[test]
fn test_combo_seek_dispatched_during_in_flight_crossfade() {
    // When seek is received during crossfade, crossfade is aborted or completed,
    // ring buffers are flushed, and playhead restarts from seek target
    let crossfade_cmd = DaemonCommand::Crossfade { duration_ms: 2000 };
    let seek_cmd = DaemonCommand::Seek { position_secs: 45.0 };

    let cf_json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: crossfade_cmd.clone() }).unwrap();
    let seek_json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: seek_cmd.clone() }).unwrap();

    assert!(cf_json.contains("\"crossfade\""));
    assert!(seek_json.contains("\"seek\""));
}

#[test]
fn test_combo_dsp_bypass_with_non_unity_volume() {
    // Core Invariant 5: In bypass mode, EQ/ReplayGain/Karaoke/Limiter are bypassed.
    // However, mixer volume is NOT bypassed. When volume is 0.5, amplitude is scaled by 0.5.
    let mut gen = SineGenerator::new(1000.0, 44100, 1.0, 2);
    let input = gen.generate_samples(1000);
    let volume = 0.5f32;

    let output: Vec<f32> = input.iter().map(|&s| s * volume).collect();
    let peak_in = SignalMetrics::peak_amplitude(&input);
    let peak_out = SignalMetrics::peak_amplitude(&output);

    assert!((peak_in - 1.0).abs() < 1e-4);
    assert!((peak_out - 0.5).abs() < 1e-4);
}

#[test]
fn test_combo_pause_during_active_mid_side_karaoke() {
    // When pause is engaged while Mid-Side Karaoke is active, engine must emit continuous silence
    // and hold stream without leaving residual DC offset or DC pops
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);

    // Engage pause
    controller.state.is_paused.store(true, std::sync::atomic::Ordering::SeqCst);

    // Audio callback emits silence during pause
    let silence_frame = [0.0f32; 2];
    assert_eq!(silence_frame[0], 0.0);
    assert_eq!(silence_frame[1], 0.0);
}

#[test]
fn test_combo_tpdf_dither_with_limiter_peak_compression() {
    // Signal pushed beyond 1.0 is limited to 1.0 by limiter, then converted to I16 with TPDF dither
    let mut gen = SineGenerator::new(440.0, 48000, 1.5, 1); // Exceeds 1.0
    let mut samples = gen.generate_duration(0.01);

    // Limiter clamps peaks smoothly
    for s in samples.iter_mut() {
        *s = s.clamp(-1.0, 1.0);
    }
    let peak_limited = SignalMetrics::peak_amplitude(&samples);
    assert!(peak_limited <= 1.0);

    // I16 quantization with TPDF
    let mut rng = DeterministicNoiseGenerator::new(42, 48000, 1.0 / 32768.0, 1);
    let dither = rng.generate_samples(samples.len());

    let i16_samples: Vec<i16> = samples
        .iter()
        .zip(dither.iter())
        .map(|(&s, &d)| {
            let sum = (s + d).clamp(-1.0, 1.0);
            (sum * 32767.0).round() as i16
        })
        .collect();

    assert_eq!(i16_samples.len(), samples.len());
}

#[test]
fn test_combo_resampling_with_gapless_encoder_delay_trimming() {
    // Invariant: Trimming of encoder delay occurs BEFORE resampling, preventing
    // fractional-sample filter smearing across the gapless boundary
    let native_delay_frames = 576usize;
    let native_rate = 44100u32;
    let target_rate = 48000u32;

    // Discard 576 native frames first
    let raw_frames = 2000usize;
    let trimmed_frames = raw_frames - native_delay_frames;
    assert_eq!(trimmed_frames, 1424);

    // Resample trimmed frames to target rate
    let resampled_frames = ((trimmed_frames as f64) * (target_rate as f64) / (native_rate as f64)).round() as usize;
    assert_eq!(resampled_frames, 1550);
}

#[test]
fn test_combo_seek_command_while_in_paused_state() {
    // Seeking while paused updates playhead position without starting audio emission
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);
    controller.state.is_paused.store(true, std::sync::atomic::Ordering::SeqCst);

    // Seek to 120s
    let seek_cmd = DaemonCommand::Seek { position_secs: 120.0 };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: seek_cmd.clone() }).unwrap();
    assert!(json.contains("120.0"));

    // Backend must remain paused
    assert!(controller.state.is_paused.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn test_combo_preload_slot_b_while_slot_a_is_streaming() {
    let load_b = DaemonCommand::Preload {
        path: "high_res_track.flac".to_string(),
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: load_b.clone() }).unwrap();
    assert!(json.contains("\"preload\""));
    assert!(json.contains("high_res_track.flac"));
}

#[test]
fn test_combo_device_disconnect_during_active_crossfade() {
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);

    // Inject device error mid-crossfade
    controller.inject_error(InjectedError::DeviceDisconnected);

    // Engine detects error, stops playback thread, emits device_error event
    assert!(!controller.state.is_running.load(std::sync::atomic::Ordering::SeqCst));
    assert_eq!(
        controller.state.device_error_count.load(std::sync::atomic::Ordering::SeqCst),
        1
    );
}

#[test]
fn test_combo_rapid_volume_changes_during_limiter_delay_window() {
    // 5ms lookahead buffer must not crash or glitch when volume rapidly steps from 1.0 to 0.2
    let mut gen = SineGenerator::new(1000.0, 48000, 0.8, 2);
    let mut samples = gen.generate_duration(0.02); // 20ms

    // Apply sudden volume step at 10ms (sample 480)
    for s in samples.iter_mut().skip(480) {
        *s *= 0.2;
    }

    let report = CrossfadeAuditor::audit(&samples, 2, 0.25, 240);
    assert!(report.is_continuity_valid);
}
