//! Real-Time Allocation Audit Test.
//!
//! Installs a custom global counting allocator to strictly measure heap allocations
//! during the real-time audio rendering loop (Mixer render -> DSP process pass).
//!
//! Asserts that zero heap allocations (`ALLOCATION_COUNT == 0`) take place during
//! the real-time callback execution window.

use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::dsp::{DspConfig, DspPipeline};
use engine_lib::mixer::{DualSlotMixer, SlotId};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;

struct CountingAllocator;

static TRACK_ALLOCATIONS: AtomicBool = AtomicBool::new(false);
static ALLOCATION_COUNT: AtomicUsize = AtomicUsize::new(0);
static MALLOC_COUNT: AtomicUsize = AtomicUsize::new(0);
static REALLOC_COUNT: AtomicUsize = AtomicUsize::new(0);
static DEALLOC_COUNT: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
            MALLOC_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.alloc(layout)
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        if TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
            REALLOC_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.realloc(ptr, layout, new_size)
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
            MALLOC_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.alloc_zeroed(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            DEALLOC_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.dealloc(ptr, layout)
    }
}

#[global_allocator]
static GLOBAL_ALLOC: CountingAllocator = CountingAllocator;

static AUDIT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[test]
fn test_audio_callback_strict_zero_allocations() {
    let _lock = AUDIT_LOCK.lock().unwrap();
    let spec = AudioSpec::new_f32_stereo(48000);
    let (mut producer, consumer) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_signal = Arc::new(AtomicBool::new(false));

    // Fill ring buffer with 1 second of stereo audio
    let test_pcm = vec![0.5f32; 48000 * 2];
    producer.push_with_backpressure(&test_pcm, &stop_signal).unwrap();

    let mut mixer = DualSlotMixer::new();
    mixer.slot_mut(SlotId::A).prime(consumer, spec, stop_signal);
    mixer.play();

    // Configure DSP pipeline with all constituent processors fully active
    let mut dsp = DspPipeline::new(48000.0);
    dsp.update_config(DspConfig {
        bypass: false,
        replaygain_db: -3.0,
        eq_gains: [1.0, -1.0, 2.0, -2.0, 0.5, -0.5, 1.5, -1.5, 0.0, 0.0],
        karaoke: true,
        limiter: true,
        sound_profile: Default::default(),
    });

    // Pre-allocate the hardware output buffer slice (simulating CPAL hardware callback buffer)
    let mut hardware_output_slice = [0.0f32; 1024];

    // Warm up the pipeline
    let _ = mixer.render(&mut hardware_output_slice);
    dsp.process(&mut hardware_output_slice);

    // ARM ALLOCATION TRACKER: strictly measure the audio rendering callback loop
    ALLOCATION_COUNT.store(0, Ordering::SeqCst);
    TRACK_ALLOCATIONS.store(true, Ordering::SeqCst);

    // Run 50 real-time callback rendering cycles, including a crossfade
    // transition so Option::take / auto-splice branches are measured too.
    for i in 0..50 {
        if i == 25 {
            // Break tracking briefly to prime slot B (primes allocate by
            // design: allocation-free applies to render, not setup).
            TRACK_ALLOCATIONS.store(false, Ordering::SeqCst);
            let (mut pb, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
            let stop_b = Arc::new(AtomicBool::new(false));
            let fill = vec![0.25f32; 48000];
            pb.push_with_backpressure(&fill, &stop_b).unwrap();
            mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);
            let _ = mixer.start_crossfade(512);
            drop(fill);
            ALLOCATION_COUNT.store(0, Ordering::SeqCst);
            TRACK_ALLOCATIONS.store(true, Ordering::SeqCst);
        }
        let _ = mixer.render(&mut hardware_output_slice);
        dsp.process(&mut hardware_output_slice);
    }

    // DISARM ALLOCATION TRACKER
    TRACK_ALLOCATIONS.store(false, Ordering::SeqCst);
    let count = ALLOCATION_COUNT.load(Ordering::SeqCst);

    assert_eq!(
        count, 0,
        "REAL-TIME VIOLATION: Audio thread callback performed {} heap allocations!",
        count
    );
}

#[test]
fn test_audio_callback_continuous_sound_profile_toggle_zero_allocations() {
    use engine_protocol::SoundProfile;

    let _lock = AUDIT_LOCK.lock().unwrap();
    let spec = AudioSpec::new_f32_stereo(48000);
    let (mut producer, consumer) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_signal = Arc::new(AtomicBool::new(false));

    // Fill ring buffer with 2 seconds of stereo audio (96000 frames)
    let test_pcm = vec![0.5f32; 96000 * 2];
    producer.push_with_backpressure(&test_pcm, &stop_signal).unwrap();

    let mut mixer = DualSlotMixer::new();
    mixer.slot_mut(SlotId::A).prime(consumer, spec, stop_signal);
    mixer.play();

    // Configure DSP pipeline
    let mut dsp = DspPipeline::new(48000.0);
    dsp.update_config(DspConfig {
        bypass: false,
        replaygain_db: -3.0,
        eq_gains: [1.0, -1.0, 2.0, -2.0, 0.5, -0.5, 1.5, -1.5, 0.0, 0.0],
        karaoke: true,
        limiter: true,
        sound_profile: SoundProfile::StudioReference,
    });

    let mut hardware_output_slice = [0.0f32; 512];

    // Warm up the pipeline
    let _ = mixer.render(&mut hardware_output_slice);
    dsp.process(&mut hardware_output_slice);

    // ARM ALLOCATION TRACKER: strictly measure audio rendering during continuous profile toggling
    MALLOC_COUNT.store(0, Ordering::SeqCst);
    REALLOC_COUNT.store(0, Ordering::SeqCst);
    DEALLOC_COUNT.store(0, Ordering::SeqCst);
    TRACK_ALLOCATIONS.store(true, Ordering::SeqCst);

    // Run 100 audio rendering cycles (~1.06 seconds of audio)
    // Toggling sound profile back and forth at ~40Hz (every 5 cycles)
    for i in 0..100 {
        if i % 10 == 0 {
            dsp.set_sound_profile(SoundProfile::VocalNuanceBoost);
        } else if i % 5 == 0 {
            dsp.set_sound_profile(SoundProfile::StudioReference);
        }

        let written = mixer.render(&mut hardware_output_slice);
        dsp.process(&mut hardware_output_slice[..written]);
    }

    // DISARM ALLOCATION TRACKER
    TRACK_ALLOCATIONS.store(false, Ordering::SeqCst);

    let mallocs = MALLOC_COUNT.load(Ordering::SeqCst);
    let reallocs = REALLOC_COUNT.load(Ordering::SeqCst);
    let deallocs = DEALLOC_COUNT.load(Ordering::SeqCst);

    println!(
        "\nSoundProfile Toggle RT Safety Audit (100 blocks, 20 profile flips):\n\
         - malloc:  {mallocs}\n\
         - realloc: {reallocs}\n\
         - free:    {deallocs}"
    );

    assert_eq!(mallocs, 0, "REAL-TIME VIOLATION: malloc occurred during audio callback with profile toggle!");
    assert_eq!(reallocs, 0, "REAL-TIME VIOLATION: realloc occurred during audio callback with profile toggle!");
    assert_eq!(deallocs, 0, "REAL-TIME VIOLATION: free/dealloc occurred during audio callback with profile toggle!");
}
