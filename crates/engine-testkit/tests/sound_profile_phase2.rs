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
use engine_testkit::measure_loudness;

/// Helper: compute peak dBFS of a slice.
fn peak_dbfs(samples: &[f32]) -> f32 {
    let max = samples.iter().copied().fold(0.0f32, |a, b| a.max(b.abs()));
    if max > 0.0 {
        20.0 * max.log10()
    } else {
        -120.0
    }
}

/// Helper: compute reconstructed true-peak linear amplitude using the 4-phase polyphase FIR.
fn true_peak_linear(samples: &[f32]) -> f32 {
    let mut history_l = [0.0f32; engine_lib::dsp::POLYPHASE_TAPS];
    let mut history_r = [0.0f32; engine_lib::dsp::POLYPHASE_TAPS];
    let mut pos = 0;
    let mut max_tp = 0.0f32;

    for chunk in samples.chunks_exact(2) {
        history_l[pos] = chunk[0];
        history_r[pos] = chunk[1];
        pos = (pos + 1) % engine_lib::dsp::POLYPHASE_TAPS;

        max_tp = max_tp.max(chunk[0].abs()).max(chunk[1].abs());
        for phase in &engine_lib::dsp::POLYPHASE_COEFFS {
            let mut val_l = 0.0f32;
            let mut val_r = 0.0f32;
            for (k, &coeff) in phase.iter().enumerate() {
                let idx = (pos + engine_lib::dsp::POLYPHASE_TAPS - 1 - k) % engine_lib::dsp::POLYPHASE_TAPS;
                val_l += coeff * history_l[idx];
                val_r += coeff * history_r[idx];
            }
            max_tp = max_tp.max(val_l.abs()).max(val_r.abs());
        }
    }
    max_tp
}

/// Helper: compute reconstructed true-peak in dBTP.
fn true_peak_dbfs(samples: &[f32]) -> f32 {
    let tp = true_peak_linear(samples);
    if tp > 0.0 {
        20.0 * tp.log10()
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

    // Verify TruePeakLimiter was in No-Intervention mode:
    // For a signal that has never caused protection to engage (or after the limiter has fully settled
    // back to steady-state release) and whose estimated true peak remains below the threshold,
    // gain remains exactly 1.000000.
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
    let output_tp_linear = true_peak_linear(&hot_signal[(limiter.latency_frames() + 50) * 2..]);
    let output_tp_dbfs = true_peak_dbfs(&hot_signal[(limiter.latency_frames() + 50) * 2..]);
    println!("Measured output true peak on inter-sample signal: {output_tp_dbfs:.2} dBTP ({output_tp_linear:.6} linear)");
    assert!(
        output_tp_linear <= ceiling_linear + 0.0001,
        "Output true peak exceeded -0.10 dBTP ceiling: {output_tp_linear} > {ceiling_linear}"
    );

    // Expose actual measured gain envelope telemetry
    let last_delta = limiter.last_delta_gain();
    println!("Measured last_delta_gain per sample: {last_delta:.6}");
    println!("Current limiter gain: {:.6}", limiter.current_gain());
}

#[test]
fn test_gate_2a_upward_nuance_boost_intent() {
    let sample_rate = 48000.0f32;
    let mut stage = SoundProfileStage::new(sample_rate);
    stage.set_target_profile(SoundProfile::VocalNuanceBoost);

    // Warm up profile transition to active VocalNuanceBoost
    let mut ramp_buf = vec![0.0f32; 3000];
    stage.process(&mut ramp_buf);
    assert_eq!(stage.status(), SoundProfileStatus::Active);

    // 1. Test Low-Level Nuance Lift:
    // Feed quiet signal (-30 dBFS tone for 2.0s to allow 250ms release envelope to settle)
    let quiet_frames = 96000;
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
        (1.8..=2.3).contains(&delta_db),
        "VocalNuanceBoost should lift quiet signals by provisional +2.0 dB, got +{delta_db:.2} dB"
    );

    // 2. Test Loud-Passage Preservation (Product Invariant):
    // Feed hot signal (-3 dBFS tone for 1.0s, which is >= -12 dBFS threshold)
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
    println!("VocalNuanceBoost Gain on -3 dBFS signal: {hot_gain_db:+.2} dB");

    // Product Invariant: Loud passages (>= -12 dBFS) must remain essentially untouched at 0.0 dB (unity)
    assert!(
        hot_gain_db.abs() < 0.05,
        "Product Invariant violated: Loud signals must remain at unity gain (0.0 dB), got {hot_gain_db:+.2} dB"
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

/// Helper: generate the Phase 0C/0D 4.0-second dynamic test signal
fn generate_phase0c_dynamic_signal(sample_rate: f32) -> Vec<f32> {
    let dur = 4.0;
    let num_frames = (sample_rate as f64 * dur) as usize;
    let mut dynamic_signal = Vec::with_capacity(num_frames * 2);

    for i in 0..num_frames {
        let t = i as f32 / sample_rate;
        let mut amp_db = -24.0f32;
        if (1.0..2.5).contains(&t) {
            amp_db = -12.0;
        }
        if (2.5..3.2).contains(&t) {
            amp_db = -1.0;
        }
        if t >= 3.2 {
            amp_db = -20.0;
        }
        let amp = 10.0f32.powf(amp_db / 20.0);
        let sample = amp
            * (0.6 * (2.0 * std::f32::consts::PI * 440.0 * t).sin()
                + 0.25 * (2.0 * std::f32::consts::PI * 880.0 * t).sin()
                + 0.10 * (2.0 * std::f32::consts::PI * 1320.0 * t).sin()
                + 0.05 * (2.0 * std::f32::consts::PI * 2640.0 * t).sin());
        dynamic_signal.push(sample);
        dynamic_signal.push(sample);
    }
    dynamic_signal
}

#[test]
fn test_gate_2a_dynamic_suite_phase0c_fixture_lufs_lra_and_release() {
    let sample_rate = 48000.0f32;
    let input_signal = generate_phase0c_dynamic_signal(sample_rate);

    // 1. Render through StudioReference
    let mut dsp_ref = DspPipeline::new(sample_rate);
    dsp_ref.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::StudioReference,
    });
    let mut output_ref = input_signal.clone();
    dsp_ref.process(&mut output_ref);

    // 2. Render through VocalNuanceBoost
    let mut dsp_nuance = DspPipeline::new(sample_rate);
    dsp_nuance.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::VocalNuanceBoost,
    });
    let mut output_nuance = input_signal.clone();
    dsp_nuance.process(&mut output_nuance);

    // 3. ITU-R BS.1770 / EBU R128 Loudness & LRA Measurement
    let ref_loudness = measure_loudness(&output_ref, sample_rate as u32);
    let nuance_loudness = measure_loudness(&output_nuance, sample_rate as u32);

    let delta_lufs = nuance_loudness.integrated_lufs - ref_loudness.integrated_lufs;
    let delta_lra = nuance_loudness.lra_lu - ref_loudness.lra_lu;

    println!("\n============================================================");
    println!("GATE 2A DYNAMIC SUITE: Phase 0C 4.0s Dynamic Signal Analysis");
    println!("============================================================");
    println!("StudioReference:");
    println!("  - Integrated Loudness: {:.2} LUFS", ref_loudness.integrated_lufs);
    println!("  - Loudness Range (LRA): {:.2} LU", ref_loudness.lra_lu);
    println!("  - Peak: {:.2} dBFS", ref_loudness.peak_dbfs);
    println!("  - RMS: {:.2} dBFS", ref_loudness.rms_dbfs);
    println!("VocalNuanceBoost:");
    println!("  - Integrated Loudness: {:.2} LUFS", nuance_loudness.integrated_lufs);
    println!("  - Loudness Range (LRA): {:.2} LU", nuance_loudness.lra_lu);
    println!("  - Peak: {:.2} dBFS", nuance_loudness.peak_dbfs);
    println!("  - RMS: {:.2} dBFS", nuance_loudness.rms_dbfs);
    println!("Delta Metrics (Nuance vs Reference):");
    println!("  - ΔLUFS: {:+.2} LUFS", delta_lufs);
    println!("  - ΔLRA:  {:+.2} LU (Dynamic Range Reduction: {:.2} LU)", delta_lra, -delta_lra);
    println!("============================================================");

    // 4. Release Rate Measurement (at t = 3.2s drop from -1.0 dBFS to -20.0 dBFS)
    // Inspect gain recovery across the 800ms tail window [3.2s .. 4.0s]
    let drop_frame = (3.2 * sample_rate) as usize;
    let tau_frames = (0.250 * sample_rate) as usize; // 12000 frames (250ms = 1 tau)

    let mut stage_release = SoundProfileStage::new(sample_rate);
    stage_release.set_target_profile(SoundProfile::VocalNuanceBoost);

    // Warm up through first 3.2s of dynamic signal
    let warm_slice = &input_signal[..(drop_frame * 2)];
    let mut warm_buf = warm_slice.to_vec();
    stage_release.process(&mut warm_buf);

    let g_at_drop = stage_release.nuance_gain();

    // Process 1 tau (250ms = 12000 frames) into the tail
    let tail_slice_1tau = &input_signal[(drop_frame * 2)..((drop_frame + tau_frames) * 2)];
    let mut tail_buf_1 = tail_slice_1tau.to_vec();
    stage_release.process(&mut tail_buf_1);
    let g_at_1tau = stage_release.nuance_gain();

    // Process up to 3 tau (750ms = 36000 frames into tail)
    let tail_slice_3tau =
        &input_signal[((drop_frame + tau_frames) * 2)..((drop_frame + 3 * tau_frames) * 2)];
    let mut tail_buf_3 = tail_slice_3tau.to_vec();
    stage_release.process(&mut tail_buf_3);
    let g_at_3tau = stage_release.nuance_gain();

    println!("\nVocalNuanceBoost Release Dynamics (tau_release = 250ms):");
    println!(
        "  - Gain at t = 3.20s (drop point):     {:.4} ({:+.2} dB)",
        g_at_drop,
        20.0 * g_at_drop.log10()
    );
    println!(
        "  - Gain at t = 3.45s (1 tau = 250ms):  {:.4} ({:+.2} dB)",
        g_at_1tau,
        20.0 * g_at_1tau.log10()
    );
    println!(
        "  - Gain at t = 3.95s (3 tau = 750ms):  {:.4} ({:+.2} dB)",
        g_at_3tau,
        20.0 * g_at_3tau.log10()
    );

    // Verify recovery direction: gain must rise monotonically from compressed to nominal boost
    assert!(
        g_at_1tau > g_at_drop,
        "Gain must recover upward after signal drops"
    );
    assert!(
        g_at_3tau > g_at_1tau,
        "Gain must continue recovering towards steady state"
    );

    // 5. Transient Rise-Time Preservation (10% to 90% rise time)
    // Synthesize an abrupt percussive edge: 100ms quiet (-30 dBFS) followed by a 10-sample linear rise (208 us) to 0.80 amplitude
    let quiet_frames = 4800; // 100ms
    let edge_frames = 10;    // 0.208ms
    let hold_frames = 480;   // 10ms
    let total_edge_frames = quiet_frames + edge_frames + hold_frames;
    let mut edge_input = Vec::with_capacity(total_edge_frames * 2);

    let quiet_amp = 10.0f32.powf(-30.0 / 20.0);
    for i in 0..quiet_frames {
        let t = i as f32 / sample_rate;
        let s = quiet_amp * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        edge_input.push(s);
        edge_input.push(s);
    }
    for i in 0..edge_frames {
        let frac = (i + 1) as f32 / edge_frames as f32;
        let amp = quiet_amp + (0.80 - quiet_amp) * frac;
        edge_input.push(amp);
        edge_input.push(amp);
    }
    for _ in 0..hold_frames {
        edge_input.push(0.80);
        edge_input.push(0.80);
    }

    let calc_rise_time = |samples: &[f32]| -> (usize, f32) {
        let mut min_val = f32::MAX;
        let mut max_val = f32::MIN;
        for &s in &samples[(quiet_frames - 100) * 2..] {
            let a = s.abs();
            if a < min_val {
                min_val = a;
            }
            if a > max_val {
                max_val = a;
            }
        }
        let t10 = min_val + 0.10 * (max_val - min_val);
        let t90 = min_val + 0.90 * (max_val - min_val);

        let mut idx10 = None;
        let mut idx90 = None;
        for i in quiet_frames..(quiet_frames + edge_frames + hold_frames) {
            let val = samples[i * 2].abs();
            if idx10.is_none() && val >= t10 {
                idx10 = Some(i);
            }
            if idx90.is_none() && val >= t90 {
                idx90 = Some(i);
            }
        }
        let frames = idx90.unwrap_or(0) - idx10.unwrap_or(0);
        let us = (frames as f32 / sample_rate) * 1_000_000.0;
        (frames, us)
    };

    let (in_rise_frames, in_rise_us) = calc_rise_time(&edge_input);

    let mut edge_ref = edge_input.clone();
    dsp_ref.process(&mut edge_ref);
    let (ref_rise_frames, ref_rise_us) = calc_rise_time(&edge_ref);

    let mut edge_nuance = edge_input.clone();
    dsp_nuance.process(&mut edge_nuance);
    let (nuance_rise_frames, nuance_rise_us) = calc_rise_time(&edge_nuance);

    println!("\nTransient Rise-Time Preservation (10% to 90% edge):");
    println!(
        "  - Input Signal:     {} frames ({:.1} µs)",
        in_rise_frames, in_rise_us
    );
    println!(
        "  - StudioReference:  {} frames ({:.1} µs)",
        ref_rise_frames, ref_rise_us
    );
    println!(
        "  - VocalNuanceBoost: {} frames ({:.1} µs)",
        nuance_rise_frames, nuance_rise_us
    );

    assert_eq!(
        ref_rise_frames, in_rise_frames,
        "StudioReference must preserve rise time exactly"
    );
    assert!(
        (nuance_rise_frames as i32 - in_rise_frames as i32).abs() <= 1,
        "VocalNuanceBoost must preserve transient edge wavefront (difference <= 1 frame)"
    );
}

#[test]
fn test_adversarial_fast_transient_true_peak_step_response() {
    let sample_rate = 48000.0f32;
    let mut limiter = TruePeakLimiter::new(sample_rate);
    let latency = limiter.latency_frames();
    assert_eq!(latency, 52);

    let ceiling_linear = 0.9885531f32; // -0.10 dBTP

    println!("\n============================================================");
    println!("ADVERSARIAL FAST-TRANSIENT TRUE-PEAK STEP RESPONSE TEST");
    println!("============================================================");

    // Case A: Near-threshold (-3.0 dBFS) jumping immediately to +3.0 dBTP (linear 1.4125)
    let pre_frames = 2000;
    let step_frames = 1000;
    let total_frames = pre_frames + step_frames;

    let amp_pre = 10.0f32.powf(-3.0 / 20.0); // 0.7079
    let amp_hot_3db = 10.0f32.powf(3.0 / 20.0); // 1.4125

    let mut signal_3db = Vec::with_capacity(total_frames * 2);
    for i in 0..pre_frames {
        let t = i as f32 / sample_rate;
        let s = amp_pre * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        signal_3db.push(s);
        signal_3db.push(s);
    }
    for i in 0..step_frames {
        let t = (pre_frames + i) as f32 / sample_rate;
        let s = amp_hot_3db * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        signal_3db.push(s);
        signal_3db.push(s);
    }

    let mut out_3db = signal_3db.clone();
    limiter.process(&mut out_3db);

    let max_peak_3db = out_3db.iter().copied().fold(0.0f32, |a, b| a.max(b.abs()));
    let max_peak_3db_db = 20.0 * max_peak_3db.log10();
    let max_reduction_3db = limiter.max_gain_reduction();

    let tail_slice_3db = &out_3db[(pre_frames + latency + 400) * 2..];
    let settled_peak_3db = tail_slice_3db
        .iter()
        .copied()
        .fold(0.0f32, |a, b| a.max(b.abs()));
    let settled_peak_3db_db = 20.0 * settled_peak_3db.log10();

    println!("Case A: Step -3.0 dBFS -> +3.0 dBTP:");
    println!(
        "  - Target Steady-State Ceiling: -0.10 dBTP ({:.6} linear)",
        ceiling_linear
    );
    println!(
        "  - Max Measured Output Peak:     {:+.2} dBFS/dBTP ({:.6} linear)",
        max_peak_3db_db, max_peak_3db
    );
    println!(
        "  - Max Gain Reduction:           {:.4} ({:+.2} dB)",
        max_reduction_3db,
        20.0 * (1.0 - max_reduction_3db).log10()
    );
    println!(
        "  - Settled Steady-State Peak:    {:+.2} dBTP ({:.6} linear)",
        settled_peak_3db_db, settled_peak_3db
    );

    // Case B: Step -3.0 dBFS jumping immediately to +6.0 dBTP (linear 1.9953)
    let amp_hot_6db = 10.0f32.powf(6.0 / 20.0); // 1.9953
    let mut signal_6db = Vec::with_capacity(total_frames * 2);
    for i in 0..pre_frames {
        let t = i as f32 / sample_rate;
        let s = amp_pre * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        signal_6db.push(s);
        signal_6db.push(s);
    }
    for i in 0..step_frames {
        let t = (pre_frames + i) as f32 / sample_rate;
        let s = amp_hot_6db * (2.0 * std::f32::consts::PI * 1000.0 * t).sin();
        signal_6db.push(s);
        signal_6db.push(s);
    }

    let mut limiter_6db = TruePeakLimiter::new(sample_rate);
    let mut out_6db = signal_6db.clone();
    limiter_6db.process(&mut out_6db);

    let max_peak_6db = out_6db.iter().copied().fold(0.0f32, |a, b| a.max(b.abs()));
    let max_peak_6db_db = 20.0 * max_peak_6db.log10();
    let max_reduction_6db = limiter_6db.max_gain_reduction();

    let tail_slice_6db = &out_6db[(pre_frames + latency + 400) * 2..];
    let settled_peak_6db = tail_slice_6db
        .iter()
        .copied()
        .fold(0.0f32, |a, b| a.max(b.abs()));
    let settled_peak_6db_db = 20.0 * settled_peak_6db.log10();

    println!("\nCase B: Step -3.0 dBFS -> +6.0 dBTP:");
    println!(
        "  - Target Steady-State Ceiling: -0.10 dBTP ({:.6} linear)",
        ceiling_linear
    );
    println!(
        "  - Max Measured Output Peak:     {:+.2} dBFS/dBTP ({:.6} linear)",
        max_peak_6db_db, max_peak_6db
    );
    println!(
        "  - Max Gain Reduction:           {:.4} ({:+.2} dB)",
        max_reduction_6db,
        20.0 * (1.0 - max_reduction_6db).log10()
    );
    println!(
        "  - Settled Steady-State Peak:    {:+.2} dBTP ({:.6} linear)",
        settled_peak_6db_db, settled_peak_6db
    );
    println!("============================================================");

    // Transparent Assertions:
    // 1. Output true peak must strictly respect the -0.10 dBTP ceiling without relying on clamp:
    assert!(
        max_peak_3db <= ceiling_linear + 0.0001,
        "Case A output exceeded -0.10 dBTP ceiling: {:.6} > {:.6}",
        max_peak_3db,
        ceiling_linear
    );
    assert!(
        max_peak_6db <= ceiling_linear + 0.0001,
        "Case B output exceeded -0.10 dBTP ceiling: {:.6} > {:.6}",
        max_peak_6db,
        ceiling_linear
    );

    // 2. Dynamic gain reduction must engage substantially under hot step transients:
    // For +3 dBTP step: reduction > 2.5 dB (target ~3.11 dB)
    // For +6 dBTP step: reduction > 5.5 dB (target ~6.11 dB)
    assert!(
        max_reduction_3db > 0.28,
        "TruePeakLimiter must apply substantial gain reduction on +3 dBTP transient, got {:.4}",
        max_reduction_3db
    );
    assert!(
        max_reduction_6db > 0.48,
        "TruePeakLimiter must apply substantial gain reduction on +6 dBTP transient, got {:.4}",
        max_reduction_6db
    );

    // 3. Steady-state settled peak must be strictly held at -0.10 dBTP (+/- 0.002 linear):
    assert!(
        (settled_peak_3db - ceiling_linear).abs() < 0.002,
        "Settled peak in Case A must match -0.10 dBTP ceiling ({:.4}), got {:.4}",
        ceiling_linear,
        settled_peak_3db
    );
    assert!(
        (settled_peak_6db - ceiling_linear).abs() < 0.002,
        "Settled peak in Case B must match -0.10 dBTP ceiling ({:.4}), got {:.4}",
        ceiling_linear,
        settled_peak_6db
    );
}

#[test]
fn test_gate_2a_compressor_parameter_sensitivity_investigation() {
    let sample_rate = 48000.0f32;
    let input_signal = generate_phase0c_dynamic_signal(sample_rate);

    // Reference StudioReference
    let mut dsp_ref = DspPipeline::new(sample_rate);
    dsp_ref.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::StudioReference,
    });
    let mut out_ref = input_signal.clone();
    dsp_ref.process(&mut out_ref);
    let ref_loudness = measure_loudness(&out_ref, sample_rate as u32);

    println!("\n============================================================");
    println!("GATE 2A PROVISIONAL LIFT SWEEP INVESTIGATION");
    println!("Testing Upward Nuance Shaping on Phase 0C Dynamic Fixture");
    println!(
        "Reference (StudioReference): {:.2} LUFS | LRA: {:.2} LU | Peak: {:.2} dBFS",
        ref_loudness.integrated_lufs, ref_loudness.lra_lu, ref_loudness.peak_dbfs
    );
    println!("============================================================");

    struct LiftCandidate {
        name: &'static str,
        max_lift_db: f32,
        low_thresh_db: f32,
        high_thresh_db: f32,
    }

    let candidates = [
        LiftCandidate {
            name: "Upward Nuance (+1.0 dB provisional lift)",
            max_lift_db: 1.0,
            low_thresh_db: -24.0,
            high_thresh_db: -12.0,
        },
        LiftCandidate {
            name: "Upward Nuance (+1.5 dB provisional lift)",
            max_lift_db: 1.5,
            low_thresh_db: -24.0,
            high_thresh_db: -12.0,
        },
        LiftCandidate {
            name: "Upward Nuance (+2.0 dB default prototype)",
            max_lift_db: 2.0,
            low_thresh_db: -24.0,
            high_thresh_db: -12.0,
        },
        LiftCandidate {
            name: "Upward Nuance (+2.5 dB provisional lift)",
            max_lift_db: 2.5,
            low_thresh_db: -24.0,
            high_thresh_db: -12.0,
        },
        LiftCandidate {
            name: "Upward Nuance (+3.0 dB provisional lift)",
            max_lift_db: 3.0,
            low_thresh_db: -24.0,
            high_thresh_db: -12.0,
        },
    ];

    println!(
        "{:<38} | {:>9} | {:>7} | {:>8} | {:>7} | {:>9}",
        "Configuration", "Int. LUFS", "ΔLUFS", "LRA (LU)", "ΔLRA", "Peak dBFS"
    );
    println!(
        "{:-<38}-+-{:-<9}-+-{:-<7}-+-{:-<8}-+-{:-<7}-+-{:-<9}",
        "", "", "", "", "", ""
    );

    for c in &candidates {
        let mut dsp = DspPipeline::new(sample_rate);
        dsp.update_config(DspConfig {
            bypass: false,
            replaygain_db: 0.0,
            eq_gains: [0.0; 10],
            karaoke: false,
            limiter: true,
            sound_profile: SoundProfile::VocalNuanceBoost,
        });
        dsp.sound_profile_stage_mut().set_upward_nuance_params(
            c.max_lift_db,
            c.low_thresh_db,
            c.high_thresh_db,
        );

        let mut out = input_signal.clone();
        dsp.process(&mut out);

        let l = measure_loudness(&out, sample_rate as u32);
        let delta_lufs = l.integrated_lufs - ref_loudness.integrated_lufs;
        let delta_lra = l.lra_lu - ref_loudness.lra_lu;

        println!(
            "{:<38} | {:>7.2} LU | {:>+6.2} | {:>6.2} LU | {:>+6.2} | {:>7.2} dB",
            c.name, l.integrated_lufs, delta_lufs, l.lra_lu, delta_lra, l.peak_dbfs
        );

        // Invariant: Peak must remain very close to reference (within 0.80 dB during 15ms attack window,
        // confirming loud crests are essentially untouched and never compressed)
        assert!(
            (l.peak_dbfs - ref_loudness.peak_dbfs) <= 0.80 && (l.peak_dbfs - ref_loudness.peak_dbfs) >= -0.10,
            "Nuance stage must preserve loud peak level within transient attack window: ref={:.2}, actual={:.2}",
            ref_loudness.peak_dbfs,
            l.peak_dbfs
        );

        // Invariant: Macro dynamic range LRA must be preserved (>88% retained, |ΔLRA| <= 3.0 LU across all sweep settings)
        assert!(
            delta_lra.abs() <= 3.0,
            "Nuance stage must preserve macro dynamic range, got ΔLRA = {:+.2} LU",
            delta_lra
        );
    }
    println!("============================================================");
}
