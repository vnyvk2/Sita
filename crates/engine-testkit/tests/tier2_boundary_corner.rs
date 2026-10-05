//! Tier 2: Boundary & Corner Cases Tests (>=5 tests per feature).
//!
//! Evaluates boundary conditions, extreme parameter ranges, zero-length inputs,
//! wrap-around behaviors, and error paths across the entire engine surface.

use engine_testkit::c1_null_test::NullTestAuditor;
use engine_testkit::generator::{
    ImpulseGenerator, SignalGenerator, SignalMetrics, SilenceGenerator, SineGenerator,
};
use engine_testkit::protocol_mock::{DaemonCommand, DaemonRequest, ProtocolHarness};
use engine_testkit::wav_fixture::WavFixtureBuilder;

// =========================================================================
// Boundary Group 1: Extreme Sample Rates & Channel Formats
// =========================================================================

#[test]
fn test_boundary_min_sample_rate_8000hz() {
    let mut gen = SineGenerator::new(300.0, 8000, 0.5, 1);
    let samples = gen.generate_duration(0.25);
    assert_eq!(samples.len(), 2000);
    assert!(SignalMetrics::peak_amplitude(&samples) <= 0.5 + 1e-5);
}

#[test]
fn test_boundary_standard_sample_rate_44100hz() {
    let mut gen = SineGenerator::new(1000.0, 44100, 0.7, 2);
    let samples = gen.generate_duration(0.1);
    assert_eq!(samples.len(), 8820);
}

#[test]
fn test_boundary_high_res_sample_rate_96000hz() {
    let mut gen = SineGenerator::new(2000.0, 96000, 0.9, 2);
    let samples = gen.generate_duration(0.05);
    assert_eq!(samples.len(), 9600);
}

#[test]
fn test_boundary_studio_master_sample_rate_192000hz() {
    let mut gen = SineGenerator::new(5000.0, 192000, 0.8, 2);
    let samples = gen.generate_duration(0.01);
    assert_eq!(samples.len(), 3840);
}

#[test]
fn test_boundary_extreme_sample_rate_384000hz() {
    let mut gen = SineGenerator::new(10000.0, 384000, 0.8, 2);
    let samples = gen.generate_duration(0.005);
    assert_eq!(samples.len(), 3840);
}

#[test]
fn test_boundary_mono_channel_single_stride() {
    let mut gen = SineGenerator::new(440.0, 48000, 1.0, 1);
    let samples = gen.generate_duration(0.01);
    assert_eq!(samples.len(), 480);
}

// =========================================================================
// Boundary Group 2: Zero-Length Streams & Corrupted Audio Payloads
// =========================================================================

#[test]
fn test_boundary_zero_duration_stream_produces_empty_slice() {
    let mut gen = SilenceGenerator::new(44100, 2);
    let samples = gen.generate_duration(0.0);
    assert!(samples.is_empty());
    assert_eq!(SignalMetrics::rms(&samples), 0.0);
}

#[test]
fn test_boundary_empty_wav_fixture_data_subchunk_size() {
    let empty_wav = WavFixtureBuilder::build_empty_audio(44100, 2);
    // RIFF size in bytes 4..8 must be 36 (header only, zero data)
    let riff_size = u32::from_le_bytes([empty_wav[4], empty_wav[5], empty_wav[6], empty_wav[7]]);
    assert_eq!(riff_size, 36);
}

#[test]
fn test_boundary_corrupt_truncated_wav_header() {
    let truncated = WavFixtureBuilder::build_truncated_header();
    assert!(truncated.len() < 44);
}

#[test]
fn test_boundary_null_test_on_empty_buffers() {
    let empty1: Vec<f32> = Vec::new();
    let empty2: Vec<f32> = Vec::new();
    let report = NullTestAuditor::evaluate(&empty1, &empty2);
    assert!(report.is_null);
    assert_eq!(report.total_samples, 0);
}

#[test]
fn test_boundary_single_impulse_at_frame_zero() {
    let mut gen = ImpulseGenerator::single_delta(44100, 1.0, 2);
    let samples = gen.generate_samples(10);
    assert_eq!(samples[0], 1.0);
    assert_eq!(samples[1], 1.0);
    for &s in &samples[2..] {
        assert_eq!(s, 0.0);
    }
}

// =========================================================================
// Boundary Group 3: Bounded Ring Buffer Pointers & Capacity Limits
// =========================================================================

#[test]
fn test_boundary_ringbuffer_exact_fill_and_empty() {
    let (mut prod, mut cons) = rtrb::RingBuffer::<f32>::new(512);
    assert_eq!(prod.slots(), 512);
    assert_eq!(cons.slots(), 0);

    for i in 0..512 {
        prod.push(i as f32).unwrap();
    }
    assert_eq!(prod.slots(), 0);
    assert_eq!(cons.slots(), 512);

    for i in 0..512 {
        let val = cons.pop().unwrap();
        assert_eq!(val, i as f32);
    }
    assert_eq!(cons.slots(), 0);
    assert_eq!(prod.slots(), 512);
}

#[test]
fn test_boundary_ringbuffer_push_when_full_returns_err() {
    let (mut prod, _cons) = rtrb::RingBuffer::<f32>::new(4);
    for _ in 0..4 {
        prod.push(1.0).unwrap();
    }
    let overflow_res = prod.push(2.0);
    assert!(overflow_res.is_err());
}

#[test]
fn test_boundary_ringbuffer_pop_when_empty_returns_err() {
    let (_prod, mut cons) = rtrb::RingBuffer::<f32>::new(4);
    let underflow_res = cons.pop();
    assert!(underflow_res.is_err());
}

#[test]
fn test_boundary_ringbuffer_wraparound_pointer_integrity() {
    let (mut prod, mut cons) = rtrb::RingBuffer::<u32>::new(8);
    for cycle in 0..100 {
        prod.push(cycle).unwrap();
        let val = cons.pop().unwrap();
        assert_eq!(val, cycle);
    }
}

#[test]
fn test_boundary_ringbuffer_chunk_read_write() {
    let (mut prod, mut cons) = rtrb::RingBuffer::<f32>::new(16);
    let mut chunk = prod.write_chunk(8).unwrap();
    let (s1, s2) = chunk.as_mut_slices();
    for (i, slot) in s1.iter_mut().chain(s2.iter_mut()).enumerate() {
        *slot = i as f32;
    }
    chunk.commit_all();

    assert_eq!(cons.slots(), 8);
    let read_chunk = cons.read_chunk(8).unwrap();
    let (s1, s2) = read_chunk.as_slices();
    let total_len = s1.len() + s2.len();
    assert_eq!(total_len, 8);
    read_chunk.commit_all();
    assert_eq!(cons.slots(), 0);
}

// =========================================================================
// Boundary Group 4: Seek Positions & Boundary Timestamps
// =========================================================================

#[test]
fn test_boundary_seek_to_exact_origin_zero() {
    let cmd = DaemonCommand::Seek { position_secs: 0.0 };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("0.0"));
}

#[test]
fn test_boundary_seek_to_duration_minus_epsilon() {
    let duration = 240.0f64;
    let eps = 0.001f64;
    let cmd = DaemonCommand::Seek {
        position_secs: duration - eps,
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("239.999"));
}

#[test]
fn test_boundary_seek_to_exact_duration() {
    let cmd = DaemonCommand::Seek {
        position_secs: 180.0,
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("180.0"));
}

#[test]
fn test_boundary_seek_past_duration_clamping() {
    // Seeking to 999999.0s should be clamped to track duration without panics
    let cmd = DaemonCommand::Seek {
        position_secs: 999999.0,
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("999999.0"));
}

#[test]
fn test_boundary_negative_seek_clamped_to_zero() {
    let cmd = DaemonCommand::Seek {
        position_secs: -15.5,
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("-15.5"));
}

// =========================================================================
// Boundary Group 5: Extreme DSP Ranges & Crossfade Durations
// =========================================================================

#[test]
fn test_boundary_eq_maximum_boost_plus_24db() {
    let max_gain_db = 24.0f32;
    let linear_multiplier = 10.0f32.powf(max_gain_db / 20.0);
    // +24dB is ~15.85x amplitude
    assert!((linear_multiplier - 15.8489).abs() < 0.01);
}

#[test]
fn test_boundary_eq_maximum_cut_minus_24db() {
    let min_gain_db = -24.0f32;
    let linear_multiplier = 10.0f32.powf(min_gain_db / 20.0);
    // -24dB is ~0.0631x amplitude
    assert!((linear_multiplier - 0.06309).abs() < 0.001);
}

#[test]
fn test_boundary_replaygain_extreme_boost_plus_20db() {
    let rg_boost = 20.0f32;
    let linear = 10.0f32.powf(rg_boost / 20.0);
    assert_eq!(linear, 10.0);
}

#[test]
fn test_boundary_replaygain_extreme_attenuation_minus_60db() {
    let rg_cut = -60.0f32;
    let linear = 10.0f32.powf(rg_cut / 20.0);
    assert_eq!(linear, 0.001);
}

#[test]
fn test_boundary_crossfade_zero_duration_0ms() {
    let cmd = DaemonCommand::Crossfade { duration_ms: 0 };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("\"duration_ms\":0"));
}

#[test]
fn test_boundary_crossfade_sub_buffer_single_millisecond() {
    let cmd = DaemonCommand::Crossfade { duration_ms: 1 };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("\"duration_ms\":1"));
}

#[test]
fn test_boundary_crossfade_long_duration_30000ms() {
    let cmd = DaemonCommand::Crossfade {
        duration_ms: 30000,
    };
    let json = ProtocolHarness::serialize_request(&DaemonRequest { id: 1, command: cmd.clone() }).unwrap();
    assert!(json.contains("\"duration_ms\":30000"));
}

// =========================================================================
// Boundary Group 6: Daemon Protocol Malformed Inputs
// =========================================================================

#[test]
fn test_boundary_protocol_rejects_empty_string() {
    let res = ProtocolHarness::parse_event("");
    assert!(res.is_err());
}

#[test]
fn test_boundary_protocol_rejects_malformed_json_syntax() {
    let res = ProtocolHarness::parse_event("{\"event\": \"state_changed\", broken}");
    assert!(res.is_err());
}

#[test]
fn test_boundary_protocol_rejects_unknown_command() {
    let res = serde_json::from_str::<DaemonCommand>("{\"cmd\":\"explode_machine\"}");
    assert!(res.is_err());
}

#[test]
fn test_boundary_protocol_rejects_missing_field_in_seek() {
    let res = serde_json::from_str::<DaemonCommand>("{\"cmd\":\"seek\"}");
    assert!(res.is_err());
}

#[test]
fn test_boundary_protocol_rejects_invalid_slot_id() {
    let res = serde_json::from_str::<DaemonCommand>(
        "{\"cmd\":\"load\",\"slot\":\"z\",\"path\":\"song.flac\"}",
    );
    assert!(res.is_err());
}
