//! Phase B: Deterministic DualSlotMixer Test Matrix for FADING × Interruption Scenarios.
//!
//! [FLAW-DEMONSTRATOR / DIAGNOSTIC CHARACTERIZATION SUITE]
//! This suite characterizes edge-case interruption behaviors during active crossfading
//! (seek, Next, Previous, pause, stop/load). Tests serve as diagnostic evidence to detect
//! and demonstrate subtle mixer transitions, early flips, and source-level edge cases.
//!
//! Captures:
//! - active_slot
//! - slot(A).state and slot(B).state
//! - crossfade.is_some()
//! - sample values and continuity

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::mixer::{DualSlotMixer, SlotId, SlotState};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;

fn setup_mixer_with_tracks(val_a: f32, val_b: f32) -> (DualSlotMixer, AudioSpec) {
    let spec = AudioSpec::new_f32_stereo(48000);
    let mut mixer = DualSlotMixer::new();

    // Slot A with constant val_a
    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    prod_a.try_push(&vec![val_a; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);

    // Slot B with constant val_b
    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_b = Arc::new(AtomicBool::new(false));
    prod_b.try_push(&vec![val_b; 2000]);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();
    (mixer, spec)
}

#[test]
fn test_fading_interrupted_by_seek_on_source_slot() {
    let (mut mixer, spec) = setup_mixer_with_tracks(1.0, 2.0);

    // Start 100-frame crossfade from Slot A to Slot B
    mixer.start_crossfade(100).expect("Failed to start crossfade");
    assert!(mixer.crossfade.is_some());
    assert_eq!(mixer.active_slot, SlotId::A);

    // 1. Render 30 frames (mid-fade)
    let mut buf1 = vec![0.0f32; 60];
    let n1 = mixer.render(&mut buf1);
    assert_eq!(n1, 60);
    assert!(mixer.crossfade.is_some(), "Must still be fading mid-transition");

    // 2. User seeks on active slot A: prime Slot A with new position audio (val = 5.0)
    let (mut prod_a_seek, cons_a_seek) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a_seek = Arc::new(AtomicBool::new(false));
    prod_a_seek.try_push(&vec![5.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_a_seek, spec, stop_a_seek);
    mixer.slot_mut(SlotId::A).play();

    // STATE CAPTURE IMMEDIATELY AFTER SEEK:
    println!("\n--- STATE AFTER SEEK ON SLOT A ---");
    println!("active_slot: {:?}", mixer.active_slot);
    println!("slot A state: {:?}", mixer.slot(SlotId::A).state);
    println!("slot B state: {:?}", mixer.slot(SlotId::B).state);
    println!("crossfade present: {}", mixer.crossfade.is_some());

    // 3. Render remaining 70 frames to past crossfade completion
    let mut buf2 = vec![0.0f32; 140];
    let n2 = mixer.render(&mut buf2);
    assert_eq!(n2, 140);

    // POST-COMPLETION STATE CAPTURE:
    println!("\n--- STATE AFTER CROSSFADE COMPLETION POST-SEEK ---");
    println!("active_slot: {:?}", mixer.active_slot);
    println!("slot A state: {:?}", mixer.slot(SlotId::A).state);
    println!("slot B state: {:?}", mixer.slot(SlotId::B).state);
    println!("crossfade present: {}", mixer.crossfade.is_some());

    // FLAW VERIFICATION:
    // Even though the user sought into Slot A, the uncancelled crossfade finished
    // and forcibly marked Slot A as Eos and switched active_slot to Slot B!
    assert_eq!(
        mixer.active_slot,
        SlotId::B,
        "FLAW PROVEN: Uncancelled crossfade forcibly switched active_slot to Slot B after seek!"
    );
    assert_eq!(
        mixer.slot(SlotId::A).state,
        SlotState::Eos,
        "FLAW PROVEN: Slot A (the sought track) was killed and marked EOS by the old crossfade!"
    );
}

#[test]
fn test_fading_interrupted_by_previous_button() {
    let (mut mixer, spec) = setup_mixer_with_tracks(1.0, 2.0);

    // Crossfade A -> B in progress
    mixer.start_crossfade(100).expect("Failed to start crossfade");

    // Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User clicks Previous: wants to return to beginning of Track A
    let (mut prod_a_prev, cons_a_prev) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a_prev = Arc::new(AtomicBool::new(false));
    prod_a_prev.try_push(&vec![1.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_a_prev, spec, stop_a_prev);
    mixer.slot_mut(SlotId::A).play();

    // Render remaining 70 frames
    let mut buf_end = vec![0.0f32; 140];
    mixer.render(&mut buf_end);

    // FLAW VERIFICATION:
    // Previous track A is suppressed; active_slot ends up on Track B!
    assert_eq!(mixer.active_slot, SlotId::B);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Eos);
}

#[test]
fn test_fading_interrupted_by_pause_and_resume() {
    let (mut mixer, _) = setup_mixer_with_tracks(1.0, 2.0);

    // Start 100-frame crossfade
    mixer.start_crossfade(100).expect("Failed to start crossfade");

    // Render 30 frames
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User pauses
    mixer.pause();
    assert!(mixer.is_paused);

    // Render 50 frames during pause -> outputs silence
    let mut pause_buf = vec![999.0f32; 100];
    mixer.render(&mut pause_buf);
    for s in pause_buf {
        assert_eq!(s, 0.0, "Paused render must emit continuous silence");
    }

    // Crossfade is still preserved in memory
    assert!(mixer.crossfade.is_some());

    // User resumes playback
    mixer.play();
    assert!(!mixer.is_paused);

    // Render remaining 70 frames
    let mut resume_buf = vec![0.0f32; 140];
    mixer.render(&mut resume_buf);

    // Crossfade successfully completes after unpause
    assert!(!mixer.crossfade.is_some());
    assert_eq!(mixer.active_slot, SlotId::B);
}

#[test]
fn test_fading_interrupted_by_stop_and_delayed_play() {
    let (mut mixer, spec) = setup_mixer_with_tracks(1.0, 2.0);

    // Start 100-frame crossfade
    mixer.start_crossfade(100).expect("Failed to start crossfade");

    // Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User stops playback
    mixer.pause();

    // In DaemonCommand::Stop, backend is stopped, but mixer.crossfade is NOT cleared!
    assert!(mixer.crossfade.is_some());

    // User loads brand new track into Slot A
    let (mut prod_new, cons_new) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_new = Arc::new(AtomicBool::new(false));
    prod_new.try_push(&vec![9.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_new, spec, stop_new);

    // User presses Play
    mixer.play();

    // Render remaining 70 frames
    let mut buf_after = vec![0.0f32; 140];
    mixer.render(&mut buf_after);

    // FLAW VERIFICATION:
    // The old crossfade from the stopped session finishes and switches active_slot to Slot B!
    assert_eq!(mixer.active_slot, SlotId::B);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Eos);
}
