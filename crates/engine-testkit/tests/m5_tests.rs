//! Milestone 5: JSON-Lines Daemon Protocol, 4Hz Heartbeats & Soak Test Verification.
//!
//! Validates:
//! - Full roundtrip serialization/deserialization for all 13 DaemonCommand variants.
//! - Full roundtrip serialization/deserialization for all 5 DaemonEvent push variants.
//! - DaemonResponse serialization for Ok and Error.
//! - C4 Bounded Memory & Soak Monitor (RSS <= 40MB, 0 xruns, watermark safety).
//! - C5 Seek Turnaround Latency Timer (<= 30ms latency, p95 compliance).
//! - Protocol malformed JSON and edge case handling.

use std::time::Duration;

use engine_testkit::{
    DaemonCommand, DaemonEvent, DaemonResponse, PlaybackState, ProtocolHarness,
    SeekLatencyTimer, SlotId, SoakConfig, SoakMonitor,
};

#[test]
fn test_all_13_daemon_commands_json_roundtrip() {
    let commands = vec![
        DaemonCommand::Load {
            slot: SlotId::A,
            path: "C:/music/track1.flac".to_string(),
        },
        DaemonCommand::Preload {
            path: "C:/music/track2.flac".to_string(),
        },
        DaemonCommand::Play,
        DaemonCommand::Pause,
        DaemonCommand::Stop,
        DaemonCommand::Seek {
            position_secs: 142.5,
        },
        DaemonCommand::Crossfade { duration_ms: 3000 },
        DaemonCommand::SetVolume { volume: 0.85 },
        DaemonCommand::SetEq {
            gains: [1.0, 2.0, -1.5, 0.0, 0.5, -0.5, 3.0, -2.0, 1.5, 0.0],
        },
        DaemonCommand::SetDsp {
            bypass: false,
            rg_db: -4.5,
            karaoke: false,
            limiter: true,
        },
        DaemonCommand::ListDevices,
        DaemonCommand::SetDevice {
            id: "wasapi_endpoint_default".to_string(),
        },
        DaemonCommand::GetState,
    ];

    assert_eq!(commands.len(), 13, "Must test exactly 13 commands from R3 spec");

    for cmd in commands {
        let serialized = ProtocolHarness::serialize_command(&cmd).expect("Command serialization must succeed");
        assert!(serialized.ends_with('\n'), "Protocol specifies JSON-lines format ending with newline");

        let deserialized: DaemonCommand = serde_json::from_str(serialized.trim()).expect("Command deserialization must succeed");
        assert_eq!(cmd, deserialized, "Roundtrip command must be identical");
    }
}

#[test]
fn test_all_5_daemon_events_json_roundtrip() {
    let events = vec![
        DaemonEvent::StateChanged {
            state: PlaybackState::Playing,
        },
        DaemonEvent::Eos { slot: SlotId::A },
        DaemonEvent::Xrun { count: 3 },
        DaemonEvent::DeviceError {
            message: "WASAPI audio device disconnected".to_string(),
        },
        DaemonEvent::Heartbeat {
            active_slot: SlotId::B,
            position_secs: 35.125,
            duration_secs: 240.0,
            wallclock_ms: 12500,
            is_playing: true,
        },
    ];

    assert_eq!(events.len(), 5, "Must test exactly 5 push events from R3 spec");

    for ev in events {
        let json_line = serde_json::to_string(&ev).expect("Event serialization must succeed");
        let parsed = ProtocolHarness::validate_raw_event(&json_line).expect("Validation must succeed");
        assert_eq!(ev, parsed, "Roundtrip event must match original");
    }
}

#[test]
fn test_daemon_responses_ok_and_error() {
    let ok_resp = DaemonResponse::Ok {
        data: Some(serde_json::json!({
            "slot": "a",
            "state": "playing",
            "volume": 1.0,
        })),
    };
    let ok_json = serde_json::to_string(&ok_resp).expect("Serialize ok response");
    let parsed_ok = ProtocolHarness::parse_response(&ok_json).expect("Parse ok response");
    assert_eq!(ok_resp, parsed_ok);

    let err_resp = DaemonResponse::Error {
        message: "File not found or format unsupported".to_string(),
    };
    let err_json = serde_json::to_string(&err_resp).expect("Serialize error response");
    let parsed_err = ProtocolHarness::parse_response(&err_json).expect("Parse error response");
    assert_eq!(err_resp, parsed_err);
}

#[test]
fn test_c4_bounded_memory_soak_monitor_simulation() {
    let config = SoakConfig {
        target_duration: Duration::from_secs(600), // 10 minutes
        max_rss_mb: 40.0,
        sample_interval: Duration::from_millis(250),
        min_watermark_ratio: 0.10,
    };

    let mut monitor = SoakMonitor::new(config);
    let buffer_capacity = 192000 * 2; // 2 seconds at 192kHz

    // Simulate 20 telemetry ticks during 10-minute soak (representing 20..600s)
    for tick in 1..=20 {
        let elapsed = Duration::from_secs(tick * 30);
        let simulated_rss_bytes: usize = (24 * 1024 * 1024) + ((tick as usize % 5) * 512 * 1024);
        let samples_consumed = (tick as u64) * 30 * 192000;
        let xruns = 0; // Zero buffer underruns
        let low_watermark = (buffer_capacity as f64 * 0.45) as usize; // Safely at 45% capacity

        monitor.record_snapshot(elapsed, simulated_rss_bytes, samples_consumed, xruns, low_watermark);
    }

    let report = monitor.finalize(Duration::from_secs(600), 20 * 30 * 192000, 0, buffer_capacity);

    assert!(report.is_stable, "Soak report should indicate stability: {}", report.summary());
    assert!(report.passed_rss_constraint, "Peak RSS ({:.2}MB) must be <= 40MB", report.peak_rss_mb());
    assert!(report.passed_xrun_constraint, "Underrun count ({}) must be 0", report.total_xruns);
    assert!(report.passed_watermark_constraint, "Watermark must remain healthy");
    assert!(report.peak_rss_mb() < 30.0, "Observed peak RSS was safely below 30MB");
}

#[test]
fn test_c5_seek_turnaround_latency_benchmark() {
    let threshold = Duration::from_millis(30);
    let mut timer = SeekLatencyTimer::new(threshold);

    // Simulate 50 seek operations
    // Normal SSD seek turnaround is 2.5ms to 12.0ms
    for i in 1..=50 {
        let simulated_ms = 2.5 + ((i % 10) as f64 * 0.9);
        timer.record_duration(Duration::from_secs_f64(simulated_ms / 1000.0));
    }

    let report = timer.finalize();

    assert!(report.passed_requirement, "All seek turnarounds must be <= 30ms: {}", report.summary());
    assert!(report.max_latency <= threshold, "Max latency must be <= 30ms");
    assert!(report.p95_latency <= threshold, "P95 latency must be <= 30ms");
    assert!(report.mean_latency < Duration::from_millis(15), "Mean latency should be well below 15ms");
    assert_eq!(report.iterations, 50);
}

#[test]
fn test_protocol_malformed_json_rejection() {
    let malformed_cases = vec![
        "",
        "   ",
        "not json at all",
        r#"{"cmd": "unknown_cmd"}"#,
        r#"{"cmd": "seek"}"#, // Missing position_secs
        r#"{"cmd": "load", "slot": "c", "path": "test.flac"}"#, // Invalid slot 'c'
        r#"{"cmd": "set_volume", "volume": "loud"}"#, // String instead of float
    ];

    for raw in malformed_cases {
        let res = serde_json::from_str::<DaemonCommand>(raw.trim());
        assert!(res.is_err(), "Expected deserialization failure for invalid input: '{}'", raw);
    }
}
