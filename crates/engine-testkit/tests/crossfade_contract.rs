//! Contract Test Suite for DualSlotMixer Interruption Invariants.
//!
//! Defines the strict contract for how crossfade transitions MUST behave
//! under interruption (seek, next/load, stop, and pause/resume).
//!
//! Contract Invariants:
//! 1. Mid-fade Seek on authoritative slot cancels crossfade, locks authoritative slot,
//!    restores unity gain (1.0), and prevents future slot flipping or EOS marking.
//! 2. Mid-fade Next/Load into target slot cancels crossfade and immediately establishes
//!    target slot as authoritative.
//! 3. Mid-fade Stop cancels crossfade completely so subsequent play starts clean.
//! 4. Mid-fade Pause/Resume preserves crossfade in-flight and completes exactly once.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::mixer::{DualSlotMixer, SlotId, SlotState};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;

fn setup_fading_mixer(val_a: f32, val_b: f32, fade_frames: usize) -> (DualSlotMixer, AudioSpec) {
    let spec = AudioSpec::new_f32_stereo(48000);
    let mut mixer = DualSlotMixer::new();

    // Slot A
    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    prod_a.try_push(&vec![val_a; 4000]);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);

    // Slot B
    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_b = Arc::new(AtomicBool::new(false));
    prod_b.try_push(&vec![val_b; 4000]);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();
    mixer.start_crossfade(fade_frames).expect("Failed to start crossfade");

    (mixer, spec)
}

#[test]
fn contract_seek_during_fade_locks_authoritative_slot() {
    let (mut mixer, spec) = setup_fading_mixer(1.0, 2.0, 100);

    // 1. Render 30 frames (mid-fade: A is fading out, B is fading in)
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some(), "Must be actively crossfading");

    // 2. Interrupt with Seek on Slot A
    // In our design: cancel_crossfade(SlotId::A) is invoked
    mixer.cancel_crossfade(SlotId::A);

    // Re-prime Slot A with new position audio (val = 5.0)
    let (mut prod_seek, cons_seek) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_seek = Arc::new(AtomicBool::new(false));
    prod_seek.try_push(&vec![5.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_seek, spec, stop_seek);
    mixer.slot_mut(SlotId::A).play();

    // CONTRACT ASSERTIONS POST-INTERRUPT:
    assert!(mixer.crossfade.is_none(), "Crossfade must be cancelled immediately");
    assert_eq!(mixer.active_slot, SlotId::A, "Slot A must be authoritative");
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing, "Slot A must be Playing");
    assert_ne!(mixer.slot(SlotId::B).state, SlotState::Crossfading, "Slot B must not be Crossfading");
    assert_eq!(mixer.slot(SlotId::A).gain, 1.0, "Authoritative slot gain must be restored to 1.0");

    // 3. Render 150 frames (well past original fade duration)
    let mut render_buf = vec![0.0f32; 300];
    let rendered = mixer.render(&mut render_buf);
    assert_eq!(rendered, 300);

    // CONTRACT POST-COMPLETION ASSERTIONS:
    assert_eq!(mixer.active_slot, SlotId::A, "Slot A MUST remain active; old fade must NOT steal focus");
    assert_ne!(mixer.slot(SlotId::A).state, SlotState::Eos, "Slot A MUST NOT be marked Eos");
    
    // Output must be purely from Slot A (val = 5.0) with unity gain
    for s in render_buf {
        assert!((s - 5.0).abs() < 1e-5, "Rendered sample must be 5.0 from Slot A, got {}", s);
    }
}

#[test]
fn contract_next_during_fade_locks_incoming_slot() {
    let (mut mixer, spec) = setup_fading_mixer(1.0, 2.0, 100);

    // Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User skips Next mid-fade: Slot B was fading in, so user commits to Slot B immediately,
    // or primes Slot B with the next track (val = 9.0)
    mixer.cancel_crossfade(SlotId::B);

    let (mut prod_next, cons_next) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_next = Arc::new(AtomicBool::new(false));
    prod_next.try_push(&vec![9.0f32; 2000]);
    mixer.slot_mut(SlotId::B).prime(cons_next, spec, stop_next);
    mixer.slot_mut(SlotId::B).play();

    // CONTRACT ASSERTIONS:
    assert!(mixer.crossfade.is_none());
    assert_eq!(mixer.active_slot, SlotId::B);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Playing);
    assert_ne!(mixer.slot(SlotId::A).state, SlotState::Crossfading);
    assert_eq!(mixer.slot(SlotId::B).gain, 1.0);

    // Render 100 frames
    let mut render_buf = vec![0.0f32; 200];
    mixer.render(&mut render_buf);
    assert_eq!(mixer.active_slot, SlotId::B);

    for s in render_buf {
        assert!((s - 9.0).abs() < 1e-5, "Rendered sample must be 9.0 from Slot B, got {}", s);
    }
}

#[test]
fn contract_stop_during_fade_aborts_crossfade_completely() {
    let (mut mixer, spec) = setup_fading_mixer(1.0, 2.0, 100);

    // Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User stops
    mixer.cancel_crossfade(SlotId::A);
    mixer.pause();

    assert!(mixer.crossfade.is_none(), "Crossfade must be gone on stop");
    assert!(mixer.is_paused);

    // Load new track into Slot A and play
    let (mut prod_new, cons_new) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_new = Arc::new(AtomicBool::new(false));
    prod_new.try_push(&vec![4.0f32; 2000]);
    mixer.slot_mut(SlotId::A).prime(cons_new, spec, stop_new);
    mixer.play();

    // Render 150 frames
    let mut render_buf = vec![0.0f32; 300];
    mixer.render(&mut render_buf);

    assert_eq!(mixer.active_slot, SlotId::A);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing);
    for s in render_buf {
        assert!((s - 4.0).abs() < 1e-5, "Rendered sample must be 4.0 from Slot A, got {}", s);
    }
}

#[test]
fn contract_pause_and_resume_preserves_crossfade_and_completes_normally() {
    let (mut mixer, _) = setup_fading_mixer(1.0, 2.0, 100);

    // Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // User pauses without seek/skip
    mixer.pause();
    assert!(mixer.is_paused);
    assert!(mixer.crossfade.is_some(), "Pause alone must preserve crossfade");

    // Renders silence during pause
    let mut silence = vec![99.0f32; 100];
    mixer.render(&mut silence);
    for s in silence {
        assert_eq!(s, 0.0);
    }

    // User unpauses
    mixer.play();
    assert!(!mixer.is_paused);
    assert!(mixer.crossfade.is_some(), "Unpause resumes crossfade");

    // Render remaining 70 frames to completion
    let mut resume_buf = vec![0.0f32; 140];
    mixer.render(&mut resume_buf);

    // Completes normally to Slot B
    assert!(mixer.crossfade.is_none());
    assert_eq!(mixer.active_slot, SlotId::B);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Playing);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Eos);
}

#[test]
fn contract_cancellation_is_strictly_idempotent() {
    let (mut mixer, spec) = setup_fading_mixer(1.0, 2.0, 100);

    // 1. Render 30 frames mid-fade
    let mut buf = vec![0.0f32; 60];
    mixer.render(&mut buf);
    assert!(mixer.crossfade.is_some());

    // 2. First cancellation call
    mixer.cancel_crossfade(SlotId::A);
    assert!(mixer.crossfade.is_none());
    assert_eq!(mixer.active_slot, SlotId::A);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Empty);
    assert_eq!(mixer.pending_transition_complete, None);

    // 3. Second cancellation call (idempotent duplicate)
    mixer.cancel_crossfade(SlotId::A);
    assert!(mixer.crossfade.is_none());
    assert_eq!(mixer.active_slot, SlotId::A);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Empty);
    assert_eq!(mixer.pending_transition_complete, None);

    // 4. Prime Slot A and render: no panic, no phantom transitions, Slot A remains authoritative
    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    prod_a.try_push(&vec![7.0f32; 1000]);
    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);
    mixer.play();

    let mut render_buf = vec![0.0f32; 200];
    let rendered = mixer.render(&mut render_buf);
    assert_eq!(rendered, 200);

    assert_eq!(mixer.active_slot, SlotId::A);
    assert_eq!(mixer.slot(SlotId::A).state, SlotState::Playing);
    assert_eq!(mixer.slot(SlotId::B).state, SlotState::Empty);
    assert_eq!(mixer.pending_transition_complete, None);

    for s in render_buf {
        assert!((s - 7.0).abs() < 1e-5, "Rendered sample must be 7.0 from Slot A, got {}", s);
    }
}
