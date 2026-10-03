//! Gate 1: Rust Engine Measurement Harness & Self-Null Benchmark.
//!
//! Generates TestSignal-D6 (12.0s multi-stage synthetic audio conformance fixture),
//! executes Rust -> Rust self-null calibration, renders StudioReference and Bypass modes
//! through WavSink, evaluates analytical EQ transfer functions, benchmarks CPU scaling
//! across 48kHz, 96kHz, and 192kHz, and exports stamped metrics to target/parity_artifacts.

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use engine_lib::dsp::{DspPipeline, EQ_CENTER_FREQUENCIES, EQ_DEFAULT_Q};
use engine_lib::sink::{OutputBackend, WavSink};
use engine_lib::types::AudioSpec;
use engine_protocol::SoundProfile;
use serde::{Deserialize, Serialize};

const RENDERER_SOURCE_SHA: &str = "97e6b35547bd873997a191932bb9c6d47731ca63";
const INTEGRATION_CHECKPOINT_SHA: &str = "53583d2e345fa828132b42efd6007c4ed6648da6";
const RUST_ENGINE_SHA: &str = "97e6b35547bd873997a191932bb9c6d47731ca63";

fn find_artifacts_dir() -> PathBuf {
    let candidates = [
        PathBuf::from("../../target/parity_artifacts"),
        PathBuf::from("target/parity_artifacts"),
    ];
    for p in &candidates {
        if p.exists() {
            return p.clone();
        }
    }
    let fallback = PathBuf::from("target/parity_artifacts");
    fs::create_dir_all(&fallback).ok();
    fallback
}

/// Generates the canonical 12.0-second TestSignal-D6 (stereo f32 interleaved).
///
/// Segment Layout:
/// - 0.0s..2.0s: Digital Silence & Dither Floor (-90 dBFS TPDF dither)
/// - 2.0s..4.0s: Low-Frequency EQ Bass Multitone (31.25/32 Hz, 62.5/64 Hz, 125 Hz at -18 dBFS)
/// - 4.0s..6.0s: Mid/High Quiet Nuance Multitone (200 Hz, 1 kHz, 4 kHz at -36 dBFS)
/// - 6.0s..8.0s: Dynamic Transition Shoulder (-30 dBFS to -6 dBFS linear envelope ramp at 1 kHz)
/// - 8.0s..10.0s: Full-Scale Master Audio (-1.0 dBFS multitone)
/// - 10.0s..12.0s: Intersample Peak Stress Transient (+3.0 dBFS overload; LIMITER CHARACTERIZATION ONLY)
fn generate_test_signal_d6(sample_rate: u32) -> Vec<f32> {
    let total_frames = (12.0 * sample_rate as f64).round() as usize;
    let mut buffer = vec![0.0f32; total_frames * 2];
    let sr = sample_rate as f64;

    // Simple deterministic LCG pseudo-random for TPDF dither
    let mut rng_state: u64 = 0x123456789ABCDEF0;
    let mut next_uniform = move || -> f64 {
        rng_state = rng_state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (rng_state >> 11) as f64 / (1u64 << 53) as f64
    };

    for frame in 0..total_frames {
        let t = frame as f64 / sr;

        let (sample_l, sample_r) = if t < 2.0 {
            // Stage 1: Silence & -90 dBFS TPDF dither
            let dither_amp = 10.0f64.powf(-90.0 / 20.0);
            let d1 = (next_uniform() - next_uniform()) * dither_amp;
            let d2 = (next_uniform() - next_uniform()) * dither_amp;
            (d1, d2)
        } else if t < 4.0 {
            // Stage 2: Low-Frequency EQ Bass Multitone (31.25/32 Hz, 62.5/64 Hz, 125 Hz at -18 dBFS)
            let f1 = 32.0;
            let f2 = 64.0;
            let f3 = 125.0;
            let amp = 10.0f64.powf(-18.0 / 20.0) / 3.0;
            let w1 = 2.0 * std::f64::consts::PI * f1 * t;
            let w2 = 2.0 * std::f64::consts::PI * f2 * t;
            let w3 = 2.0 * std::f64::consts::PI * f3 * t;
            let s = amp * (w1.sin() + w2.sin() + w3.sin());
            (s, s)
        } else if t < 6.0 {
            // Stage 3: Mid/High Quiet Nuance Multitone (200 Hz, 1 kHz, 4 kHz at -36 dBFS)
            let f1 = 200.0;
            let f2 = 1000.0;
            let f3 = 4000.0;
            let amp = 10.0f64.powf(-36.0 / 20.0) / 3.0;
            let w1 = 2.0 * std::f64::consts::PI * f1 * t;
            let w2 = 2.0 * std::f64::consts::PI * f2 * t;
            let w3 = 2.0 * std::f64::consts::PI * f3 * t;
            let s = amp * (w1.sin() + w2.sin() + w3.sin());
            (s, s)
        } else if t < 8.0 {
            // Stage 4: Dynamic Transition Shoulder (-30 dBFS -> -6 dBFS linear envelope ramp at 1 kHz)
            let progress = (t - 6.0) / 2.0; // 0.0 -> 1.0
            let amp_start = 10.0f64.powf(-30.0 / 20.0);
            let amp_end = 10.0f64.powf(-6.0 / 20.0);
            let env = amp_start + progress * (amp_end - amp_start);
            let s = env * (2.0 * std::f64::consts::PI * 1000.0 * t).sin();
            (s, s)
        } else if t < 10.0 {
            // Stage 5: Full-Scale Master Audio (-1.0 dBFS dense multitone)
            let amp = 10.0f64.powf(-1.0 / 20.0) / 4.0;
            let s = amp * (
                (2.0 * std::f64::consts::PI * 100.0 * t).sin()
                    + (2.0 * std::f64::consts::PI * 440.0 * t).sin()
                    + (2.0 * std::f64::consts::PI * 1500.0 * t).sin()
                    + (2.0 * std::f64::consts::PI * 5000.0 * t).sin()
            );
            (s, s)
        } else {
            // Stage 6: Intersample Peak Stress Transient (+3.0 dBFS overload; LIMITER CHARACTERIZATION ONLY)
            let overload_amp = 10.0f64.powf(3.0 / 20.0); // ~1.4125
            let s = if (frame % 2) == 0 {
                overload_amp * (2.0 * std::f64::consts::PI * 1000.0 * t).sin()
            } else {
                -overload_amp * (2.0 * std::f64::consts::PI * 1000.0 * t).sin()
            };
            (s, s)
        };

        buffer[frame * 2] = sample_l as f32;
        buffer[frame * 2 + 1] = sample_r as f32;
    }

    buffer
}

/// Compute cancellation depth in dB between reference and test signals.
fn compute_cancellation_depth(ref_sig: &[f32], test_sig: &[f32]) -> f64 {
    assert_eq!(ref_sig.len(), test_sig.len());
    let mut ref_p = 0.0f64;
    let mut diff_p = 0.0f64;

    for i in 0..ref_sig.len() {
        let r = ref_sig[i] as f64;
        let d = (test_sig[i] - ref_sig[i]) as f64;
        ref_p += r * r;
        diff_p += d * d;
    }

    if diff_p <= 1e-24 || diff_p == 0.0 {
        return 240.0;
    }
    10.0 * (ref_p / diff_p).log10()
}

/// Compute peak and RMS decibels of interleaved stereo stream.
fn compute_peak_and_rms_db(samples: &[f32]) -> (f64, f64) {
    if samples.is_empty() {
        return (-140.0, -140.0);
    }
    let mut max_val = 0.0f32;
    let mut sum_sq = 0.0f64;

    for &s in samples {
        let abs = s.abs();
        if abs > max_val {
            max_val = abs;
        }
        sum_sq += (s as f64) * (s as f64);
    }

    let peak_db = if max_val > 0.0 { 20.0 * (max_val as f64).log10() } else { -140.0 };
    let rms = (sum_sq / samples.len() as f64).sqrt();
    let rms_db = if rms > 0.0 { 20.0 * rms.log10() } else { -140.0 };
    (peak_db, rms_db)
}

/// Analytic evaluation of Robert Bristow-Johnson peaking EQ transfer function.
/// H(s) evaluated directly in z-domain without FFT windowing.
fn evaluate_analytic_peaking_eq(
    freqs_hz: &[f32],
    center_freqs: &[f32; 10],
    gains_db: &[f32; 10],
    q: f32,
    sample_rate: f32,
) -> Vec<f64> {
    let mut total_magnitude_db = vec![0.0f64; freqs_hz.len()];

    for band in 0..10 {
        let gain_db = gains_db[band];
        if gain_db.abs() < 0.001 {
            continue;
        }
        let f0 = center_freqs[band] as f64;
        let sr = sample_rate as f64;
        let q_val = q as f64;
        let a = 10.0f64.powf((gain_db as f64) / 40.0);
        let w0 = 2.0 * std::f64::consts::PI * f0 / sr;
        let alpha = w0.sin() / (2.0 * q_val);

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * w0.cos();
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * w0.cos();
        let a2 = 1.0 - alpha / a;

        let b0_n = b0 / a0;
        let b1_n = b1 / a0;
        let b2_n = b2 / a0;
        let a1_n = a1 / a0;
        let a2_n = a2 / a0;

        for (i, &f) in freqs_hz.iter().enumerate() {
            let w = 2.0 * std::f64::consts::PI * (f as f64) / sr;
            let c1 = w.cos();
            let s1 = w.sin();
            let c2 = (2.0 * w).cos();
            let s2 = (2.0 * w).sin();

            let num_r = b0_n + b1_n * c1 + b2_n * c2;
            let num_i = -(b1_n * s1 + b2_n * s2);
            let den_r = 1.0 + a1_n * c1 + a2_n * c2;
            let den_i = -(a1_n * s1 + a2_n * s2);

            let num_mag_sq = num_r * num_r + num_i * num_i;
            let den_mag_sq = den_r * den_r + den_i * den_i;
            let mag_sq = num_mag_sq / den_mag_sq;
            total_magnitude_db[i] += 10.0 * mag_sq.log10();
        }
    }

    total_magnitude_db
}

#[derive(Debug, Serialize, Deserialize)]
struct CpuBenchmarkResult {
    sample_rate: u32,
    chunk_frames: usize,
    chunk_audio_ms: f64,
    median_latency_micros: f64,
    max_latency_micros: f64,
    cpu_percent: f64,
    budget_percent: f64,
    passed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct Gate1RustReport {
    metadata: MetadataStamps,
    self_null: SelfNullReport,
    studio_ref_render: RenderMetrics,
    bypass_render: RenderMetrics,
    cpu_scaling: Vec<CpuBenchmarkResult>,
    analytic_eq_grid: AnalyticEqReport,
}

#[derive(Debug, Serialize, Deserialize)]
struct MetadataStamps {
    renderer_source_sha: String,
    integration_checkpoint_sha: String,
    rust_engine_sha: String,
    sample_rate: u32,
    duration_secs: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SelfNullReport {
    cancellation_depth_db: f64,
    peak_diff_db: f64,
    rms_diff_db: f64,
    floor_established: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct RenderMetrics {
    peak_dbfs: f64,
    rms_dbfs: f64,
    total_frames: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticEqReport {
    frequencies_hz: Vec<f32>,
    acoustic_preset_db: Vec<f64>,
    bass_booster_preset_db: Vec<f64>,
}

#[test]
fn test_gate1_rust_measurement_harness() {
    let artifacts_dir = find_artifacts_dir();
    let sample_rate = 48000u32;

    println!("============================================================");
    println!("GATE 1: RUST ENGINE MEASUREMENT HARNESS & SELF-NULL BENCHMARK");
    println!("============================================================");

    // 1. Generate canonical TestSignal-D6
    let d6_samples = generate_test_signal_d6(sample_rate);
    let total_frames = d6_samples.len() / 2;
    println!("Generated TestSignal-D6: {} frames ({} secs)", total_frames, 12.0);

    // Save raw D6 WAV fixture
    let raw_wav_path = artifacts_dir.join("test_signal_d6_48k.wav");
    let mut raw_sink = WavSink::new(&raw_wav_path);
    raw_sink.open(AudioSpec::new_f32_stereo(sample_rate)).unwrap();
    raw_sink.start().unwrap();
    raw_sink.write_samples(&d6_samples).unwrap();
    raw_sink.stop().unwrap();
    println!("Saved raw fixture -> {:?}", raw_wav_path);

    // 2. Rust -> Rust Self-Null Calibration
    let mut run_a = d6_samples.clone();
    let mut run_b = d6_samples.clone();

    let mut dsp_a = DspPipeline::new(sample_rate as f32);
    let mut dsp_b = DspPipeline::new(sample_rate as f32);

    dsp_a.process(&mut run_a);
    dsp_b.process(&mut run_b);

    let rust_self_null_db = compute_cancellation_depth(&run_a, &run_b);
    let (peak_a, rms_a) = compute_peak_and_rms_db(&run_a);
    let (peak_b, rms_b) = compute_peak_and_rms_db(&run_b);
    let peak_diff = (peak_a - peak_b).abs();
    let rms_diff = (rms_a - rms_b).abs();

    println!("\n--- RUST -> RUST SELF-NULL CALIBRATION ---");
    println!("Measured Rust Self-Null Floor: {:.2} dB", rust_self_null_db);
    println!("Run A Peak: {:.6} dBFS, RMS: {:.6} dBFS", peak_a, rms_a);
    println!("Run B Peak: {:.6} dBFS, RMS: {:.6} dBFS", peak_b, rms_b);
    assert!(
        rust_self_null_db >= 240.0,
        "Rust engine self-null floor violated: expected >= 240 dB, got {:.2} dB",
        rust_self_null_db
    );

    // 3. Render StudioReference through WavSink
    let studio_wav_path = artifacts_dir.join("rust_d6_48k_studioref.wav");
    let mut studio_sink = WavSink::new(&studio_wav_path);
    studio_sink.open(AudioSpec::new_f32_stereo(sample_rate)).unwrap();
    studio_sink.start().unwrap();
    studio_sink.write_samples(&run_a).unwrap();
    studio_sink.stop().unwrap();
    println!("Saved StudioReference render -> {:?}", studio_wav_path);

    // 4. Render Bypass through WavSink
    let mut bypass_samples = d6_samples.clone();
    let mut dsp_bypass = DspPipeline::new(sample_rate as f32);
    dsp_bypass.set_bypass(true);
    dsp_bypass.process(&mut bypass_samples);

    let (bypass_peak, bypass_rms) = compute_peak_and_rms_db(&bypass_samples);
    let bypass_wav_path = artifacts_dir.join("rust_d6_48k_bypass.wav");
    let mut bypass_sink = WavSink::new(&bypass_wav_path);
    bypass_sink.open(AudioSpec::new_f32_stereo(sample_rate)).unwrap();
    bypass_sink.start().unwrap();
    bypass_sink.write_samples(&bypass_samples).unwrap();
    bypass_sink.stop().unwrap();
    println!("Saved Bypass render -> {:?}", bypass_wav_path);

    // 5. Analytic EQ Response Grid (500 log-spaced points from 10Hz to 22kHz)
    let num_points = 500;
    let mut freqs_grid = Vec::with_capacity(num_points);
    let log_min = (10.0f64).log10();
    let log_max = (22000.0f64).log10();
    for i in 0..num_points {
        let f = 10.0f64.powf(log_min + (log_max - log_min) * (i as f64 / (num_points - 1) as f64));
        freqs_grid.push(f as f32);
    }

    let acoustic_gains: [f32; 10] = [4.8, 4.5, 3.5, 0.4, 1.8, 1.6, 3.3, 3.8, 3.3, 1.3];
    let bass_booster_gains: [f32; 10] = [5.0, 4.0, 3.0, 2.5, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0];

    let acoustic_mag_db = evaluate_analytic_peaking_eq(
        &freqs_grid,
        &EQ_CENTER_FREQUENCIES,
        &acoustic_gains,
        EQ_DEFAULT_Q,
        sample_rate as f32,
    );
    let bass_mag_db = evaluate_analytic_peaking_eq(
        &freqs_grid,
        &EQ_CENTER_FREQUENCIES,
        &bass_booster_gains,
        EQ_DEFAULT_Q,
        sample_rate as f32,
    );

    println!("\n--- ANALYTIC EQ RESPONSE EVALUATION ---");
    println!("Evaluated 500-point grid (10 Hz - 22 kHz)");
    println!("Acoustic Preset @ 32Hz: {:.2} dB, @ 1kHz: {:.2} dB, @ 16kHz: {:.2} dB",
        acoustic_mag_db[45], acoustic_mag_db[249], acoustic_mag_db[460]);
    println!("BassBooster Preset @ 32Hz: {:.2} dB, @ 64Hz: {:.2} dB, @ 1kHz: {:.2} dB",
        bass_mag_db[45], bass_mag_db[89], bass_mag_db[249]);

    // 6. Real-Time Safety & CPU Scaling Benchmarks (48k, 96k, 192k)
    println!("\n--- REAL-TIME SAFETY & CPU SCALING BENCHMARKS ---");
    let test_rates = [48000u32, 96000u32, 192000u32];
    let budgets = [2.0f64, 3.5f64, 6.0f64];
    let mut cpu_results = Vec::new();
    let chunk_frames = 1024usize;

    for (idx, &sr) in test_rates.iter().enumerate() {
        let budget = budgets[idx];
        let mut dsp = DspPipeline::new(sr as f32);
        dsp.set_sound_profile(SoundProfile::StudioReference);

        let mut test_chunk = vec![0.5f32; chunk_frames * 2];
        let chunk_audio_ms = (chunk_frames as f64 / sr as f64) * 1000.0;

        // Warm up
        for _ in 0..10 {
            dsp.process(&mut test_chunk);
        }

        // Measure 100 iterations
        let mut latencies_micros = Vec::with_capacity(100);
        for _ in 0..100 {
            let start = Instant::now();
            dsp.process(&mut test_chunk);
            let elapsed = start.elapsed();
            latencies_micros.push(elapsed.as_nanos() as f64 / 1000.0);
        }

        latencies_micros.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median_latency = latencies_micros[50];
        let max_latency = *latencies_micros.last().unwrap();
        let cpu_pct = (median_latency / (chunk_audio_ms * 1000.0)) * 100.0;
        let passed = cpu_pct < budget;

        println!(
            "Rate: {:6} Hz | Audio: {:.2} ms | Median: {:6.2} µs | Max: {:6.2} µs | CPU: {:5.2}% (Budget: < {:.1}%) -> {}",
            sr, chunk_audio_ms, median_latency, max_latency, cpu_pct, budget, if passed { "PASS" } else { "FAIL" }
        );

        cpu_results.push(CpuBenchmarkResult {
            sample_rate: sr,
            chunk_frames,
            chunk_audio_ms,
            median_latency_micros: median_latency,
            max_latency_micros: max_latency,
            cpu_percent: cpu_pct,
            budget_percent: budget,
            passed,
        });
    }

    // 7. Write complete metadata report
    let report = Gate1RustReport {
        metadata: MetadataStamps {
            renderer_source_sha: RENDERER_SOURCE_SHA.to_string(),
            integration_checkpoint_sha: INTEGRATION_CHECKPOINT_SHA.to_string(),
            rust_engine_sha: RUST_ENGINE_SHA.to_string(),
            sample_rate,
            duration_secs: 12.0,
        },
        self_null: SelfNullReport {
            cancellation_depth_db: rust_self_null_db,
            peak_diff_db: peak_diff,
            rms_diff_db: rms_diff,
            floor_established: true,
        },
        studio_ref_render: RenderMetrics {
            peak_dbfs: peak_a,
            rms_dbfs: rms_a,
            total_frames,
        },
        bypass_render: RenderMetrics {
            peak_dbfs: bypass_peak,
            rms_dbfs: bypass_rms,
            total_frames,
        },
        cpu_scaling: cpu_results,
        analytic_eq_grid: AnalyticEqReport {
            frequencies_hz: freqs_grid,
            acoustic_preset_db: acoustic_mag_db,
            bass_booster_preset_db: bass_mag_db,
        },
    };

    let report_json = serde_json::to_string_pretty(&report).unwrap();
    let json_path = artifacts_dir.join("gate1_rust_metrics.json");
    fs::write(&json_path, report_json).unwrap();
    println!("Saved Rust Gate 1 metrics -> {:?}", json_path);
}
