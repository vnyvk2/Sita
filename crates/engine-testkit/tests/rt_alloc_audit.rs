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

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if TRACK_ALLOCATIONS.load(Ordering::Relaxed) {
            ALLOCATION_COUNT.fetch_add(1, Ordering::Relaxed);
        }
        System.alloc(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout)
    }
}

#[global_allocator]
static GLOBAL_ALLOC: CountingAllocator = CountingAllocator;

#[test]
fn test_audio_callback_strict_zero_allocations() {
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
    });

    // Pre-allocate the hardware output buffer slice (simulating CPAL hardware callback buffer)
    let mut hardware_output_slice = [0.0f32; 1024];

    // Warm up the pipeline
    let _ = mixer.render(&mut hardware_output_slice);
    dsp.process(&mut hardware_output_slice);

    // ARM ALLOCATION TRACKER: strictly measure the audio rendering callback loop
    ALLOCATION_COUNT.store(0, Ordering::SeqCst);
    TRACK_ALLOCATIONS.store(true, Ordering::SeqCst);

    // Run 50 real-time callback rendering cycles
    for _ in 0..50 {
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
