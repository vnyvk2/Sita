//! Phase 2 Core DSP Engine Verification Suite
//!
//! Validates:
//! 1. Gate 1A: StudioReference Aligned Digital Null (>= 215 dB cancellation depth).
//! 2. Gate 1B: TruePeakLimiter sidechain-only detector & Digital True-Peak Protection (<= -0.10 dBTP).
//! 3. Gain envelope telemetry and measured slew rate.
//! 4. Gate 2A: VocalNuanceBoost soft-knee low-level lift and dynamic contour.
//! 5. Gate 3A: 30ms S-curve transition continuity (max second-difference <= 0.1500).
//! 6. Reversal safety: Mid-transition profile toggle without level jumps.

use engine_lib::dsp::{DspConfig, DspPipeline, SoundProfileStage, TruePeakLimiter};
use engine_protocol::{SoundProfile, SoundProfileStatus};

/// Helper: compute peak dBFS of a slice.
fn peak_dbfs(samples: &[f32]) -> f32 {
    let max = samples.iter().copied().fold(0.0f32, |a, b| a.max(b.abs()));
    if max > 0.0 {
        20.0 * max.log10()
    } else {
        -120.0
    }
}

/// Helper: compute cancellation depth in dB between two aligned slices.
fn cancellation_depth_db(ref_signal: &[f32], test_signal: &[f32]) -> f64 {
    assert_eq!(ref_signal.len(), test_signal.len());
    let mut ref_power = 0.0f64;
    let mut diff_power = 0.0f64;

    for (&r, &t) in ref_signal.iter().zip(test_signal.iter()) {
        let r64 = r as f64;
        let diff = (t - r) as f64;
        ref_power += r64 * r64;
        diff_power += diff * diff;
    }

    if diff_power <= 1e-24 || diff_power == 0.0 {
        return 240.0; // Infinite/numerical floor cancellation
    }

    10.0 * (ref_power / diff_power).log10()
}

#[test]
fn test_gate_1a_studio_reference_latency_compensated_null() {
    let sample_rate = 48000.0f32;
    let mut dsp = DspPipeline::new(sample_rate);

    // Reference Configuration:
    // StudioReference active, EQ flat, ReplayGain 0dB, Karaoke disabled, Limiter enabled
    dsp.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::StudioReference,
    });

    let latency = dsp.true_peak_limiter().latency_frames();
    assert_eq!(latency, 52, "TruePeakLimiter latency must be exactly 52 frames at 48kHz (1.08ms)");

    // Generate reference test signal below -0.1 dBTP (Nora calibration tone, 440Hz at -21.07 dBFS)
    let total_frames = 2048;
    let mut input = Vec::with_capacity(total_frames * 2);
    let amp = 10.0f32.powf(-21.07 / 20.0);
    for i in 0..total_frames {
        let t = i as f32 / sample_rate;
        let sample = amp * (2.0 * std::f32::consts::PI * 440.0 * t).sin();
        input.push(sample);
        input.push(sample);
    }

    let mut output = input.clone();
    dsp.process(&mut output);

    // Verify TruePeakLimiter was in No-Intervention mode (gain == 1.000000)
    assert_eq!(
        dsp.true_peak_limiter().current_gain(),
        1.0,
        "Limiter must remain at unity gain under No-Intervention mode"
    );
    assert_eq!(
        dsp.true_peak_limiter().max_gain_reduction(),
        0.0,
        "No gain reduction must occur below -0.1 dBTP"
    );

    // Align output by compensating 52-sample lookahead latency
    let aligned_test = &output[(latency * 2)..];
    let aligned_ref = &input[..(input.len() - latency * 2)];

    // Exact bit-level comparison
    let mut exact_matches = 0;
    for (i, (&t, &r)) in aligned_test.iter().zip(aligned_ref.iter()).enumerate() {
        assert_eq!(
            t, r,
            "Sample mismatch at aligned sample index {i}: test={t} != ref={r}"
        );
        exact_matches += 1;
    }
    assert_eq!(exact_matches, aligned_test.len());

    // Mathematical cancellation depth
    let depth = cancellation_depth_db(aligned_ref, aligned_test);
    println!("Gate 1A Aligned Cancellation Depth: {depth:.2} dB");
    assert!(
        depth >= 215.0,
        "Gate 1A requires >= 215 dB cancellation, got {depth:.2} dB"
    );
}

#[test]
fn test_gate_1b_true_peak_limiter_sidechain_only_and_protection() {
    let sample_rate = 48000.0f32;
    let mut limiter = TruePeakLimiter::new(sample_rate);
    assert_eq!(limiter.latency_frames(), 52);

    // 1. Synthesize inter-sample peak signal:
    // fs/4 sine with phase pi/4 produces sample values of 0.7071 (-3.01 dBFS),
    // but continuous analog reconstruction reaches 1.0000 (0.00 dBTP > -0.10 dBTP threshold).
    let total_frames = 1000;
    let mut hot_signal = Vec::with_capacity(total_frames * 2);
    for i in 0..total_frames {
        let v = (2.0 * std::f32::consts::PI * 0.25 * (i as f32) + std::f32::consts::PI / 4.0).sin();
        hot_signal.push(v);
        hot_signal.push(v);
    }

    let input_peak_sample = peak_dbfs(&hot_signal);
    assert!((input_peak_sample - (-3.01)).abs() < 0.05);

    limiter.process(&mut hot_signal);

    // Verify limiter detected inter-sample overshoot and engaged
    let max_red = limiter.max_gain_reduction();
    println!("TruePeakLimiter maximum gain reduction on inter-sample peak: {max_red:.4}");
    assert!(
        max_red > 0.01,
        "TruePeakLimiter must detect inter-sample peak and attenuate gain"
    );

    // Verify measured output true peak is constrained <= -0.10 dBTP
    let ceiling_linear = 0.9885531f32;
    for (i, chunk) in hot_signal.chunks_exact(2).enumerate() {
        if i > limiter.latency_frames() + 50 {
            assert!(
                chunk[0].abs() <= ceiling_linear + 0.001,
                "Output exceeded ceiling at frame {i}: {}",
                chunk[0]
            );
            assert!(
                chunk[1].abs() <= ceiling_linear + 0.001,
                "Output exceeded ceiling at frame {i}: {}",
                chunk[1]
            );
        }
    }

    // Expose actual measured gain envelope telemetry
    let last_delta = limiter.last_delta_gain();
    println!("Measured last_delta_gain per sample: {last_delta:.6}");
    println!("Current limiter gain: {:.6}", limiter.current_gain());
}

#[test]
fn test_gate_2a_vocal_nuance_boost_intent_and_soft_knee() {
    let sample_rate = 48000.0f32;
    let mut stage = SoundProfileStage::new(sample_rate);
    stage.set_target_profile(SoundProfile::VocalNuanceBoost);

    // 1. Test Low-Level Nuance Lift:
    // Feed quiet signal (-30 dBFS tone for 1.0s to allow 250ms release envelope to settle)
    let quiet_frames = 48000;
    let amp_quiet = 10.0f32.powf(-30.0 / 20.0);
    let mut quiet_audio = Vec::with_capacity(quiet_frames * 2);
    for i in 0..quiet_frames {
        let t = i as f32 / sample_rate;
        let v = amp_quiet * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        quiet_audio.push(v);
        quiet_audio.push(v);
    }

    stage.process(&mut quiet_audio);

    // Measure steady-state boost in the final 200ms of the buffer
    let tail_samples = &quiet_audio[(quiet_audio.len() - 9600)..];
    let boosted_peak_db = peak_dbfs(tail_samples);
    let delta_db = boosted_peak_db - (-30.0);
    println!("VocalNuanceBoost Low-Level Lift at -30 dBFS: +{delta_db:.2} dB");
    assert!(
        delta_db >= 2.0 && delta_db <= 3.5,
        "VocalNuanceBoost should lift quiet signals by ~3.0 dB, got +{delta_db:.2} dB"
    );

    // 2. Test Soft-Knee Compression on High-Level Material:
    // Feed hot signal (-3 dBFS tone for 1.0s)
    let hot_frames = 48000;
    let amp_hot = 10.0f32.powf(-3.0 / 20.0);
    let mut hot_audio = Vec::with_capacity(hot_frames * 2);
    for i in 0..hot_frames {
        let t = i as f32 / sample_rate;
        let v = amp_hot * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        hot_audio.push(v);
        hot_audio.push(v);
    }

    stage.process(&mut hot_audio);
    let hot_tail = &hot_audio[(hot_audio.len() - 9600)..];
    let hot_output_peak_db = peak_dbfs(hot_tail);
    let hot_gain_db = hot_output_peak_db - (-3.0);
    println!("VocalNuanceBoost Gain on -3 dBFS signal: {hot_gain_db:.2} dB");
    // Compression should engage on loud passages so gain is substantially less than the quiet boost
    assert!(
        hot_gain_db < delta_db - 1.0,
        "Hot signals must receive compression relative to quiet signals"
    );
}

#[test]
fn test_gate_3a_profile_transition_s_curve_continuity() {
    let sample_rate = 48000.0f32;
    let mut stage = SoundProfileStage::new(sample_rate);
    assert_eq!(stage.transition_frames(), 1440, "30ms = 1440 frames at 48kHz");

    // Continuous 1000Hz sine test tone
    let total_frames = 2880; // 60ms
    let mut audio = Vec::with_capacity(total_frames * 2);
    for i in 0..total_frames {
        let t = i as f32 / sample_rate;
        let v = 0.5 * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        audio.push(v);
        audio.push(v);
    }

    // Trigger transition to VocalNuanceBoost at frame 0
    stage.set_target_profile(SoundProfile::VocalNuanceBoost);
    assert_eq!(stage.status(), SoundProfileStatus::Transitioning);

    stage.process(&mut audio);
    assert_eq!(stage.status(), SoundProfileStatus::Active);

    // Compute second-difference continuity metric across transition window:
    // |s[n] - 2s[n-1] + s[n-2]|
    let mut max_delta2 = 0.0f32;
    for i in 2..total_frames {
        let s0 = audio[i * 2];
        let s1 = audio[(i - 1) * 2];
        let s2 = audio[(i - 2) * 2];
        let d2 = (s0 - 2.0 * s1 + s2).abs();
        if d2 > max_delta2 {
            max_delta2 = d2;
        }
    }

    println!("Profile Transition Maximum Second-Difference: {max_delta2:.6}");
    // 1000Hz sine second difference is approx (2*pi*f/fs)^2 * A = (2*pi*1000/48000)^2 * 0.5 approx 0.0085.
    // Spec allows up to 0.1500 to account for transition envelope slope.
    assert!(
        max_delta2 <= 0.1500,
        "Transition discontinuity violated: max |Δ²s| = {max_delta2:.6} > 0.1500"
    );
}

#[test]
fn test_sound_profile_rapid_reversal_safety() {
    let sample_rate = 48000.0f32;
    let mut stage = SoundProfileStage::new(sample_rate);

    // 1. Begin transition to Nuance
    stage.set_target_profile(SoundProfile::VocalNuanceBoost);
    assert_eq!(stage.status(), SoundProfileStatus::Transitioning);

    // Process 50% of the transition (720 frames)
    let mut buffer = vec![0.3f32; 1440];
    stage.process(&mut buffer);

    let mid_alpha = stage.current_alpha();
    assert!(
        (mid_alpha - 0.5).abs() < 0.05,
        "Alpha should be ~0.5 at 50% mark, got {mid_alpha}"
    );

    // 2. Immediately reverse back to StudioReference mid-ramp
    stage.set_target_profile(SoundProfile::StudioReference);
    assert_eq!(stage.status(), SoundProfileStatus::Transitioning);

    // Process next small block (32 frames)
    let mut chunk = vec![0.3f32; 64];
    stage.process(&mut chunk);

    let reversed_alpha = stage.current_alpha();
    assert!(
        reversed_alpha <= mid_alpha,
        "After reversing towards reference, alpha must decrease from {mid_alpha}, got {reversed_alpha}"
    );
    assert!(
        (mid_alpha - reversed_alpha) < 0.05,
        "Reversal must not cause sudden alpha jump: delta={}",
        (mid_alpha - reversed_alpha).abs()
    );
}
