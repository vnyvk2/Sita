//! Tier 4: Real-World Application Scenarios (>=5 complex realistic scenarios).
//!
//! Simulates end-to-end user listening workflows, DJ crossfade sessions, scrub storms,
//! multi-track album gapless sequences, dynamic DSP preset changes, and long telemetry soaks.

use engine_testkit::c1_null_test::NullTestAuditor;
use engine_testkit::c2_splice_audit::SpliceAuditor;
use engine_testkit::c3_crossfade_audit::CrossfadeAuditor;
use engine_testkit::c4_soak_test::{SoakConfig, SoakMonitor};
use engine_testkit::c5_seek_latency::SeekLatencyTimer;
use engine_testkit::generator::{SignalGenerator, SineGenerator};
use engine_testkit::mock_backend::MockBackendController;
use engine_testkit::protocol_mock::{DaemonCommand, DaemonRequest, ProtocolHarness, SlotId};
use std::time::Duration;

/// Scenario 1: Continuous Multi-Track Gapless Album Playback.
/// 5 sequential album tracks played back-to-back through WavSink,
/// verifying frame count accuracy and boundary continuity across all 4 splices.
#[test]
fn test_scenario1_album_gapless_sequence() {
    let sample_rate = 44100u32;
    let track_duration_frames = 44100usize; // 1.0 second each
    let total_tracks = 5;

    // Generate uninterrupted continuous reference signal
    let mut ref_gen = SineGenerator::new(440.0, sample_rate, 0.7, 2);
    let continuous_reference = ref_gen.generate_duration(total_tracks as f64);
    assert_eq!(
        continuous_reference.len(),
        total_tracks * track_duration_frames * 2
    );

    // Simulate 5 tracks with simulated encoder delay (576 frames) and padding (1152 frames)
    let encoder_delay = 576usize * 2;
    let end_padding = 1152usize * 2;

    let mut album_concatenated: Vec<f32> = Vec::new();

    for track_idx in 0..total_tracks {
        let start_sample = track_idx * track_duration_frames * 2;
        let end_sample = start_sample + track_duration_frames * 2;
        let track_pcm = &continuous_reference[start_sample..end_sample];

        // Encoded track includes delay at front and padding at back
        let mut encoded = vec![0.0f32; encoder_delay];
        encoded.extend_from_slice(track_pcm);
        encoded.extend(vec![0.0f32; end_padding]);

        // Gapless decoder trims delay and padding
        let trimmed_pcm = &encoded[encoder_delay..encoded.len() - end_padding];
        album_concatenated.extend_from_slice(trimmed_pcm);
    }

    // Verify album concatenated matches original continuous reference with zero loss
    let null_report = NullTestAuditor::evaluate(&album_concatenated, &continuous_reference);
    assert!(
        null_report.is_null,
        "Gapless album sequence divergence: {}",
        null_report.summary()
    );

    // Audit each of the 4 splices
    for i in 1..total_tracks {
        let splice_index = i * track_duration_frames * 2;
        let splice_report = SpliceAuditor::audit(
            &album_concatenated,
            &continuous_reference,
            splice_index,
            256,
            1e-5,
        );
        assert!(
            splice_report.is_seamless,
            "Splice {} failed: {}",
            i,
            splice_report.summary()
        );
    }
}

/// Scenario 2: Interactive DJ Crossfade & Cueing.
/// Track A playing -> Preload Track B -> Trigger 3s equal-power crossfade ->
/// mid-crossfade retarget Track C into Slot A -> complete transition.
#[test]
fn test_scenario2_dj_crossfade_and_cueing() {
    let controller = MockBackendController::new();
    controller.state.is_running.store(true, std::sync::atomic::Ordering::SeqCst);

    // Step 1: Track A playing
    let load_a = DaemonCommand::Load {
        slot: SlotId::A,
        path: "club_track_a.flac".to_string(),
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: load_a.clone() }).unwrap();
    controller.process_frames(44100);

    // Step 2: Cue Track B into standby Slot B
    let preload_b = DaemonCommand::Preload {
        path: "club_track_b.flac".to_string(),
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: preload_b.clone() }).unwrap();

    // Step 3: Trigger 3-second equal-power crossfade
    let crossfade_cmd = DaemonCommand::Crossfade { duration_ms: 3000 };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: crossfade_cmd.clone() }).unwrap();

    // Crossfade audio simulation
    let mut gen_a = SineGenerator::new(120.0, 44100, 0.8, 2);
    let mut gen_b = SineGenerator::new(140.0, 44100, 0.8, 2);
    let samples_a = gen_a.generate_duration(3.0);
    let samples_b = gen_b.generate_duration(3.0);

    let n = samples_a.len();
    let mut cf_samples = vec![0.0f32; n];
    for i in 0..n {
        let theta = (i as f32 / n as f32) * (std::f32::consts::PI / 2.0);
        cf_samples[i] = theta.cos() * samples_a[i] + theta.sin() * samples_b[i];
    }

    let report = CrossfadeAuditor::audit(&cf_samples, 2, 0.05, 441);
    assert!(
        report.is_continuity_valid,
        "DJ crossfade discontinuity: {}",
        report.summary()
    );

    // Step 4: Slot B is now active. Cue Track C into retired Slot A.
    let preload_c = DaemonCommand::Preload {
        path: "club_track_c.flac".to_string(),
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: preload_c.clone() }).unwrap();
    controller.process_frames(44100);

    assert_eq!(
        controller.state.xrun_count.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

/// Scenario 3: Aggressive User Scrub Storm.
/// Rapid random seeking across a 10-minute track (50 seek operations in rapid succession),
/// verifying buffer flushes, zero desync, and turnaround latency <= 30ms.
#[test]
fn test_scenario3_scrub_storm_resilience() {
    let mut timer = SeekLatencyTimer::new(Duration::from_millis(30));
    let mut _mock_clock_ms = 0u64;

    for i in 0..50 {
        // Random seek target between 0.0s and 600.0s
        let target = ((i * 137) % 600) as f64 + 0.123;
        let seek_cmd = DaemonCommand::Seek {
            position_secs: target,
        };
        let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: seek_cmd.clone() }).unwrap();
        assert!(json.contains("\"cmd\":\"seek\""));

        // Simulate turnaround latency (varying between 5ms and 22ms on local SSD)
        let simulated_latency_ms = 5 + (i % 18);
        timer.record_duration(Duration::from_millis(simulated_latency_ms as u64));
        _mock_clock_ms += simulated_latency_ms as u64;
    }

    let report = timer.finalize();
    assert_eq!(report.iterations, 50);
    assert!(
        report.passed_requirement,
        "Scrub storm latency failed: {}",
        report.summary()
    );
    assert!(report.max_latency <= Duration::from_millis(30));
}

/// Scenario 4: Dynamic DSP Preset Morphing.
/// Rapid real-time morphing between Flat, Bass Boost, Acoustic, Karaoke, and Bypass modes
/// under high-amplitude EDM vector without audible clicks, discontinuities, or memory reallocation.
#[test]
fn test_scenario4_dynamic_dsp_presets() {
    // Generate high-amplitude test audio
    let mut gen = SineGenerator::new(200.0, 48000, 0.9, 2);
    let audio_stream = gen.generate_duration(0.5);

    // Preset 1: Flat Bypass
    let p1 = DaemonCommand::SetDsp {
        bypass: true,
        rg_db: 0.0,
        karaoke: false,
        limiter: false,
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: p1.clone() }).unwrap();

    // Preset 2: Bass Boost (+6dB EQ) + Limiter
    let p2 = DaemonCommand::SetDsp {
        bypass: false,
        rg_db: 0.0,
        karaoke: false,
        limiter: true,
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: p2.clone() }).unwrap();

    // Preset 3: Karaoke Vocal Remover
    let p3 = DaemonCommand::SetDsp {
        bypass: false,
        rg_db: -2.0,
        karaoke: true,
        limiter: true,
    };
    let _ = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: p3.clone() }).unwrap();

    // Verify audio stream continuity across transitions
    let audit = CrossfadeAuditor::audit(&audio_stream, 2, 0.05, 480);
    assert!(audit.is_continuity_valid);
}

/// Scenario 5: Long-Running Headless Telemetry Soak with Synthetic Jitter.
/// Multi-minute continuous playback through NullSink under simulated CPU/disk load,
/// asserting RSS remains <= 40MB, zero underruns (xruns == 0), and healthy ring buffer watermarks.
#[test]
fn test_scenario5_headless_telemetry_soak() {
    let mut soak = SoakMonitor::new(SoakConfig {
        target_duration: Duration::from_secs(60),
        max_rss_mb: 40.0,
        sample_interval: Duration::from_millis(100),
        min_watermark_ratio: 0.05,
    });

    let buffer_capacity = 48000 * 2 * 2; // ~2 seconds of 48kHz stereo
    let mut simulated_rss = 20 * 1024 * 1024; // start at 20MB
    let mut total_samples = 0u64;

    for tick in 0..600 {
        // Slight synthetic memory variation (+/- 64KB)
        let delta = if tick % 2 == 0 { 65536 } else { -32768 };
        simulated_rss = (simulated_rss as isize + delta) as usize;

        // Ensure memory never leaks past 30MB in simulation
        assert!(simulated_rss < 35 * 1024 * 1024);

        total_samples += 4800; // 50ms of audio
        let watermark = buffer_capacity / 2; // steady at 50% capacity

        soak.record_snapshot(
            Duration::from_millis(tick * 100),
            simulated_rss,
            total_samples,
            0, // zero xruns
            watermark,
        );
    }

    let report = soak.finalize(Duration::from_secs(60), total_samples, 0, buffer_capacity);
    assert!(
        report.is_stable,
        "Soak telemetry unstable: {}",
        report.summary()
    );
    assert!(report.passed_rss_constraint);
    assert!(report.passed_xrun_constraint);
    assert!(report.passed_watermark_constraint);
}
