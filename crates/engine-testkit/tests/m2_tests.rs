//! Milestone 2: Dual-Slot Real-Time Stereo Mixer & True Gapless Verification.
//!
//! Validates:
//! - LAME Xing/Info tag parsing (12-bit delay and padding).
//! - Apple iTunSMPB 12-token hexadecimal metadata atom parsing.
//! - Pre-resampling sample trimming with frame alignment.
//! - Seamless slot transition (auto-splice) across buffer boundaries.
//! - C2 Gapless Splice Audit: Zero missing or duplicated samples across continuous reference signals.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::decoder::gapless::{
    parse_itunsmpb, parse_lame_tag, GaplessInfo, GaplessMode, GaplessTrimmer,
};
use engine_lib::mixer::{DualSlotMixer, SlotId, SlotState};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;
use engine_testkit::c2_splice_audit::SpliceAuditor;
use engine_testkit::generator::{SignalGenerator, SineGenerator};

#[test]
fn test_itunsmpb_valid_parsing() {
    let smpb = " 00000000 00000240 00000480 0000000000010000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000";
    let info = parse_itunsmpb(smpb).expect("Failed to parse valid iTunSMPB atom");
    assert_eq!(info.encoder_delay, 0x240); // 576 frames
    assert_eq!(info.encoder_padding, 0x480); // 1152 frames
    assert_eq!(info.valid_frames, Some(0x10000)); // 65536 frames
    assert!(info.has_trimming());
}

#[test]
fn test_itunsmpb_malformed_returns_none() {
    assert!(parse_itunsmpb("too short").is_none());
    assert!(parse_itunsmpb("00000000 not_hex 00000480 0000000000010000").is_none());
}

#[test]
fn test_lame_tag_parsing() {
    // Construct synthetic Xing header with LAME tag.
    // Real LAME layout: 4-byte tag + 9-byte version + 8 bytes of
    // revision/VBR/lowpass/peak/replaygain fields, with delay/padding 21
    // bytes past the tag start (NOT immediately after the version string).
    let mut header = vec![0u8; 256];
    // Write "Info" tag at offset 36
    header[36..40].copy_from_slice(b"Info");
    // Write "LAME3.100" at offset 156
    header[156..165].copy_from_slice(b"LAME3.100");
    // Set delay = 576 (0x240), padding = 1152 (0x480) at offset 156+21=177
    // Byte 177: 0x24
    // Byte 178: (0x0 << 4) | 0x4 = 0x04
    // Byte 179: 0x80
    header[177] = 0x24;
    header[178] = 0x04;
    header[179] = 0x80;

    let info = parse_lame_tag(&header).expect("Failed to parse LAME header");
    assert_eq!(info.encoder_delay, 576);
    assert_eq!(info.encoder_padding, 1152);
}

#[test]
fn test_gapless_trimmer_drops_leading_delay_and_caps_valid() {
    let channels = 2u16;
    let delay_frames = 100u64;
    let valid_frames = 200u64;
    let padding_frames = 100u64;

    let info = GaplessInfo::new(delay_frames, padding_frames, Some(valid_frames));
    let mut trimmer = GaplessTrimmer::new(channels, info, GaplessMode::Auto);

    // Create 400 stereo frames (800 samples)
    let total_samples = 400 * 2;
    let input: Vec<f32> = (0..total_samples).map(|i| i as f32).collect();

    let trimmed = trimmer.trim_interleaved(&input);

    // Expected: 200 stereo frames (400 samples)
    assert_eq!(trimmed.len(), 400);
    // First sample should be at offset delay_frames * 2 = 200
    assert_eq!(trimmed[0], 200.0);
    // Last sample should be 200 + 400 - 1 = 599.0
    assert_eq!(trimmed[399], 599.0);
    assert!(trimmer.is_exhausted());
}

#[test]
fn test_gapless_trimmer_mode_off_preserves_all() {
    let channels = 2u16;
    let info = GaplessInfo::new(576, 1152, Some(10000));
    let mut trimmer = GaplessTrimmer::new(channels, info, GaplessMode::Off);

    let input = vec![1.0f32; 2000];
    let trimmed = trimmer.trim_interleaved(&input);
    assert_eq!(trimmed.len(), 2000);
}

#[test]
fn test_dual_slot_mixer_playback_and_volume() {
    let spec = AudioSpec::new_f32_stereo(48000);
    let mut mixer = DualSlotMixer::new();

    let (mut producer, consumer) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_signal = Arc::new(AtomicBool::new(false));

    // Push 512 stereo samples (value 0.5)
    let samples = vec![0.5f32; 512];
    producer.try_push(&samples);

    mixer.slot_mut(SlotId::A).prime(consumer, spec, stop_signal);
    mixer.play();
    mixer.set_volume(0.5);

    let mut output = vec![0.0f32; 512];
    let rendered = mixer.render(&mut output);

    assert_eq!(rendered, 512);
    // 0.5 * 0.5 volume = 0.25
    for s in &output[..rendered] {
        assert!((s - 0.25).abs() < 1e-6);
    }
}

#[test]
fn test_dual_slot_mixer_equal_power_crossfade() {
    let spec = AudioSpec::new_f32_stereo(48000);
    let mut mixer = DualSlotMixer::new();

    // Setup Slot A with 1.0f32 samples
    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    prod_a.try_push(&vec![1.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);

    // Setup Slot B with 0.0f32 samples
    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_b = Arc::new(AtomicBool::new(false));
    prod_b.try_push(&vec![0.0f32; 2000]);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();
    // 100 frames crossfade (200 samples)
    mixer.start_crossfade(100).expect("Failed to start crossfade");

    let mut output = vec![0.0f32; 200];
    let rendered = mixer.render(&mut output);
    assert_eq!(rendered, 200);

    // At completion, Slot B must now be active slot
    assert_eq!(mixer.active_slot, SlotId::B);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Playing);
}

#[test]
fn test_c2_gapless_seamless_slot_splice_audit() {
    let sample_rate = 48000u32;
    let spec = AudioSpec::new_f32_stereo(sample_rate);

    // 1. Generate a continuous reference signal (e.g. 440Hz sine wave, 2048 stereo frames = 4096 samples)
    let mut gen = SineGenerator::new(440.0, sample_rate, 0.8, 2);
    let continuous_reference = gen.generate_samples(4096);

    // 2. Split into Track 1 (first 2048 samples) and Track 2 (next 2048 samples)
    let split_point = 2048usize;
    let track1_samples = &continuous_reference[..split_point];
    let track2_samples = &continuous_reference[split_point..];

    // 3. Setup DualSlotMixer with Slot A = Track 1, Slot B = Track 2
    let mut mixer = DualSlotMixer::new();

    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(true)); // Marked complete
    prod_a.try_push(track1_samples);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);

    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_b = Arc::new(AtomicBool::new(true)); // Marked complete
    prod_b.try_push(track2_samples);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();

    // 4. Render the full combined stream (4096 samples) through the mixer
    let mut concatenated_output = vec![0.0f32; 4096];
    let rendered = mixer.render(&mut concatenated_output);
    assert_eq!(rendered, 4096);

    // 5. Run the C2 SpliceAuditor
    let report = SpliceAuditor::audit(
        &concatenated_output,
        &continuous_reference,
        split_point,
        512, // Inspect +/- 512 samples around splice boundary
        1e-6, // Strict machine epsilon tolerance
    );

    println!("{}", report.summary());
    assert!(
        report.is_seamless,
        "Splice audit failed: delta={}, boundary_div={}",
        report.sample_count_delta, report.boundary_window_max_divergence
    );
    assert_eq!(report.sample_count_delta, 0);
    assert_eq!(report.boundary_window_max_divergence, 0.0);
}
