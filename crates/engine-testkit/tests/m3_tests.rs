//! Milestone 3: Ordered DSP Processing Chain & Click-Free Crossfade Verification.
//!
//! Validates:
//! - ReplayGain decibel-to-linear scaling.
//! - 10-Band peaking graphic equalizer with RBJ biquad filters.
//! - Mid-Side karaoke center vocal reduction with bass preservation.
//! - 5ms lookahead peak safety limiter.
//! - Strict DSP bypass bit-transparency.
//! - C3 Acceptance Criteria: Click-Free Crossfade Discontinuity and RMS Continuity Audit.

#![allow(deprecated)]

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use engine_lib::buffer::BoundedAudioTransport;
use engine_lib::dsp::{
    DspConfig, DspPipeline, EqualizerChain, KaraokeProcessor, PeakLimiter, ReplayGainProcessor,
};
use engine_lib::mixer::{DualSlotMixer, SlotId};
use engine_lib::sink::AudioSource;
use engine_lib::types::AudioSpec;
use engine_testkit::c3_crossfade_audit::CrossfadeAuditor;
use engine_testkit::generator::{SignalGenerator, SineGenerator};

#[test]
fn test_replaygain_scaling_and_formula() {
    let mut rg = ReplayGainProcessor::new();
    assert_eq!(rg.gain_db(), 0.0);
    assert_eq!(rg.linear_multiplier(), 1.0);
    assert!(!rg.is_enabled());

    // -6.02 dB ~= 0.5 linear amplitude
    rg.set_gain_db(-6.020_6);
    assert!(rg.is_enabled());
    assert!((rg.linear_multiplier() - 0.5).abs() < 1e-4);

    let mut samples = vec![1.0f32; 100];
    rg.process(&mut samples);
    for s in samples {
        assert!((s - 0.5).abs() < 1e-4);
    }
}

#[test]
fn test_10_band_eq_flat_response_is_passthrough() {
    let mut eq = EqualizerChain::new(48000.0);
    let mut samples: Vec<f32> = (0..100).map(|i| (i as f32) * 0.01).collect();
    let original = samples.clone();

    eq.process(&mut samples);
    for (a, b) in samples.iter().zip(original.iter()) {
        assert!((a - b).abs() < 1e-6);
    }
}

#[test]
fn test_10_band_eq_boost_and_cut() {
    let sample_rate = 48000.0;
    let mut eq_boost = EqualizerChain::new(sample_rate);
    let mut eq_cut = EqualizerChain::new(sample_rate);

    // 1kHz is Band 5 in ISO center frequencies: [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
    eq_boost.set_band_gain(5, 6.0); // +6dB at 1kHz
    eq_cut.set_band_gain(5, -6.0);  // -6dB at 1kHz

    let mut gen = SineGenerator::new(1000.0, 48000, 0.5, 2);
    let mut samples_boost = gen.generate_samples(4800);
    let mut samples_cut = samples_boost.clone();

    eq_boost.process(&mut samples_boost);
    eq_cut.process(&mut samples_cut);

    // RMS of boosted signal should exceed RMS of cut signal
    let rms_boost = (samples_boost.iter().map(|s| s * s).sum::<f32>() / samples_boost.len() as f32).sqrt();
    let rms_cut = (samples_cut.iter().map(|s| s * s).sum::<f32>() / samples_cut.len() as f32).sqrt();

    assert!(rms_boost > rms_cut);
    assert!(rms_boost > 0.35); // boosted
    assert!(rms_cut < 0.35);   // cut
}

#[test]
fn test_mid_side_karaoke_center_cancellation() {
    let mut karaoke = KaraokeProcessor::new();
    karaoke.set_enabled(true);

    // Center-panned audio: Left == Right (e.g. 1000Hz sine)
    let mut gen = SineGenerator::new(1000.0, 48000, 0.8, 2);
    let mut center_samples = gen.generate_samples(1000);

    karaoke.process(&mut center_samples);

    // Vocal center content should be reduced by at least 80%
    let max_amp = center_samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    assert!(max_amp < 0.20, "Center vocal attenuation failed: max_amp={}", max_amp);
}

#[test]
fn test_5ms_lookahead_peak_limiter_prevents_clipping() {
    let mut limiter = PeakLimiter::new(48000.0);
    limiter.set_enabled(true);

    // Massive +6dB overload signal (peak = 2.0)
    let mut gen = SineGenerator::new(440.0, 48000, 2.0, 2);
    let mut hot_samples = gen.generate_samples(4800);

    limiter.process(&mut hot_samples);

    // Verify all samples are clamped within [-1.0, 1.0] without raw hard clips
    for &s in &hot_samples {
        assert!(s.abs() <= 1.0, "Sample exceeded unity limit: {}", s);
    }
}

#[test]
fn test_dsp_pipeline_strict_bypass_bit_transparency() {
    let mut pipeline = DspPipeline::new(48000.0);

    // Configure aggressive DSP settings
    pipeline.update_config(DspConfig {
        bypass: true, // Strict bypass
        replaygain_db: -12.0,
        eq_gains: [6.0; 10],
        karaoke: true,
        limiter: true,
        sound_profile: Default::default(),
    });

    let mut samples: Vec<f32> = (0..512).map(|i| (i as f32) * 0.001).collect();
    let original = samples.clone();

    pipeline.process(&mut samples);

    // When bypass is true, samples must be bit-identical (diff == 0.0)
    for (a, b) in samples.iter().zip(original.iter()) {
        assert_eq!(*a, *b, "Bypass mode altered sample: {} vs {}", a, b);
    }
}

#[test]
fn test_c3_crossfade_discontinuity_audit() {
    let sample_rate = 48000u32;
    let spec = AudioSpec::new_f32_stereo(sample_rate);

    let mut mixer = DualSlotMixer::new();

    // 440Hz Sine Wave for Track A (natural second-difference well below tau=0.05)
    let mut gen_a = SineGenerator::new(440.0, sample_rate, 0.5, 2);
    let samples_a = gen_a.generate_samples(4800);

    // 440Hz Sine Wave for Track B with identical phase to test smooth fade
    let mut gen_b = SineGenerator::new(440.0, sample_rate, 0.5, 2);
    let samples_b = gen_b.generate_samples(4800);

    let (mut prod_a, cons_a) = BoundedAudioTransport::create(&spec, 2.0);
    let (mut prod_b, cons_b) = BoundedAudioTransport::create(&spec, 2.0);
    let stop_a = Arc::new(AtomicBool::new(false));
    let stop_b = Arc::new(AtomicBool::new(false));

    prod_a.try_push(&samples_a);
    prod_b.try_push(&samples_b);

    mixer.slot_mut(SlotId::A).prime(cons_a, spec, stop_a);
    mixer.slot_mut(SlotId::B).prime(cons_b, spec, stop_b);

    mixer.play();

    // Start 50ms crossfade (2400 frames = 4800 stereo samples)
    let crossfade_frames = 2400usize;
    mixer.start_crossfade(crossfade_frames).expect("Failed to start crossfade");

    let mut transition_buffer = vec![0.0f32; crossfade_frames * 2];
    let rendered = mixer.render(&mut transition_buffer);
    assert_eq!(rendered, crossfade_frames * 2);

    // Run the C3 CrossfadeAuditor
    let report = CrossfadeAuditor::audit(
        &transition_buffer,
        2, // Stereo
        0.05, // Tau = 0.05 max second-difference threshold
        480, // 10ms sliding window (480 frames @ 48kHz)
    );

    println!("{}", report.summary());
    assert!(
        report.is_click_free,
        "C3 Click-free crossfade audit failed: max_d2={}, max_rms_step={}",
        report.max_second_difference, report.max_rms_step_delta
    );
    assert!(report.is_continuity_valid);
    assert!(report.is_rms_power_continuous);
}

#[test]
fn test_post_dsp_master_volume_invariant_with_active_limiter() {
    let sample_rate = 48000.0;
    let mut dsp = DspPipeline::new(sample_rate);

    // Hot input signal exceeding 0.99 threshold (+3.52 dBFS peak)
    let input_hot_peak = 1.5f32;
    let mut raw_samples = vec![input_hot_peak; 960];

    // 1. Process hot audio through full DSP chain with active limiter
    dsp.process(&mut raw_samples);

    // The limiter MUST engage on the unattenuated hot signal, constraining peak <= -0.10 dBTP (0.9886)
    let limited_peak = raw_samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    assert!(
        limited_peak <= 0.9886,
        "Limiter failed to constrain hot input: {limited_peak}"
    );
    assert!(
        limited_peak > 0.50,
        "Limiter clamped too aggressively: {limited_peak}"
    );

    // Helper simulating post-DSP volume scaling (as performed in daemon render closure)
    let apply_post_dsp_volume = |mut buffer: Vec<f32>, vol: f32| -> Vec<f32> {
        if (vol - 1.0).abs() > f32::EPSILON {
            for s in &mut buffer {
                *s *= vol;
            }
        }
        buffer
    };

    // 2. Volume = 1.0: output unchanged
    let v1 = apply_post_dsp_volume(raw_samples.clone(), 1.0);
    let peak_v1 = v1.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    assert!((peak_v1 - limited_peak).abs() < 1e-6);

    // 3. Volume = 0.5: output must be exactly -6.0206 dB relative to limited peak
    let v05 = apply_post_dsp_volume(raw_samples.clone(), 0.5);
    let peak_v05 = v05.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    let expected_peak_v05 = limited_peak * 0.5;
    assert!(
        (peak_v05 - expected_peak_v05).abs() < 1e-5,
        "Volume 0.5 error: got {peak_v05}, expected {expected_peak_v05}"
    );
    let ratio_db_v05 = 20.0 * (peak_v05 / peak_v1).log10();
    assert!(
        (ratio_db_v05 - (-6.0206)).abs() < 1e-3,
        "Expected exactly -6.0206 dB at vol 0.5, got {ratio_db_v05}"
    );

    // 4. Volume = 0.25: output must be exactly -12.0412 dB relative to limited peak
    let v025 = apply_post_dsp_volume(raw_samples.clone(), 0.25);
    let peak_v025 = v025.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    let expected_peak_v025 = limited_peak * 0.25;
    assert!(
        (peak_v025 - expected_peak_v025).abs() < 1e-5,
        "Volume 0.25 error: got {peak_v025}, expected {expected_peak_v025}"
    );
    let ratio_db_v025 = 20.0 * (peak_v025 / peak_v1).log10();
    assert!(
        (ratio_db_v025 - (-12.0412)).abs() < 1e-3,
        "Expected exactly -12.0412 dB at vol 0.25, got {ratio_db_v025}"
    );

    // 5. Negative proof: prove that if volume had been applied PRE-DSP, the limiter would NOT engage
    let mut pre_attenuated = vec![input_hot_peak * 0.5; 960]; // 0.75 amplitude
    let mut dsp_pre = DspPipeline::new(sample_rate);
    dsp_pre.process(&mut pre_attenuated);
    let pre_peak = pre_attenuated.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()));
    assert!(
        (pre_peak - 0.75).abs() < 1e-4,
        "Pre-DSP volume fails because limiter is bypassed at low volumes (peak={pre_peak})"
    );
}
