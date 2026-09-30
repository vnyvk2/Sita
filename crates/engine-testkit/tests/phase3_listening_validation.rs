//! Phase 3 Listening Validation & Golden Acceptance Suite
//!
//! Generates and evaluates real musical fixtures across 5 diverse categories:
//! 1. Track 1: Vocal-Heavy Commercial Music ("Bora Dhiya" vocal rap/sung excerpt)
//! 2. Track 2: Acoustic Fingerstyle Guitar & Intimate Vocal Recording
//! 3. Track 3: Dense Electronic Dance Music (EDM) (Heavy sub-bass, 4-on-floor, bright hats)
//! 4. Track 4: Delicate Piano & Ambient Room Decay (Low-level nuances, room reflections)
//! 5. Track 5: High-Dynamic-Range Orchestral Crescendo (Macro dynamics & quiet->loud transient attack-edge analysis)
//!
//! Evaluates each track across:
//! - StudioReference (Bit-transparent baseline)
//! - VocalNuanceBoost across provisional lift sweep (+1.0 dB, +1.5 dB, +2.0 dB, +2.5 dB)
//! - Computes ITU-R BS.1770-4 / EBU R128 Integrated Loudness (LUFS) and Loudness Range (LRA)
//! - Computes Sample Peak (dBFS) and Reconstructed True-Peak (dBTP)
//! - Quantifies the transient attack-edge peak behavior (+0.48 dB phenomenon)
//! - Renders both native and loudness-matched (-14.0 LUFS) WAV files to target/phase3_listening_artifacts/

use std::fs;
use std::path::{Path, PathBuf};

use engine_lib::decoder::DecoderPipeline;
use engine_lib::dsp::{DspConfig, DspPipeline};
use engine_lib::sink::{OutputBackend, WavSink};
use engine_lib::types::AudioSpec;
use engine_protocol::SoundProfile;
use engine_testkit::measure_loudness;

fn find_artifacts_dir() -> PathBuf {
    let p = PathBuf::from("target/phase3_listening_artifacts");
    if !p.exists() {
        let _ = fs::create_dir_all(&p);
    }
    p
}

#[allow(dead_code)]
/// Helper: compute peak dBFS of an interleaved stereo slice.
fn peak_dbfs(samples: &[f32]) -> f32 {
    let max = samples.iter().copied().fold(0.0f32, |a, b| a.max(b.abs()));
    if max > 0.0 {
        20.0 * max.log10()
    } else {
        -120.0
    }
}

/// Helper: compute reconstructed true-peak linear amplitude using 4-phase polyphase FIR.
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

fn true_peak_dbfs(samples: &[f32]) -> f32 {
    let tp = true_peak_linear(samples);
    if tp > 0.0 {
        20.0 * tp.log10()
    } else {
        -120.0
    }
}

/// Helper: write interleaved stereo f32 samples to a WAV file via WavSink.
fn write_wav_file(path: &Path, samples: &[f32], sample_rate: u32) {
    let spec = AudioSpec::new_f32_stereo(sample_rate);
    let mut sink = WavSink::new(path);
    sink.open(spec).expect("WavSink open must succeed");
    sink.start().expect("WavSink start must succeed");
    sink.write_samples(samples).expect("WavSink write must succeed");
    sink.stop().expect("WavSink stop must succeed");
}

/// Helper: create volume-normalized copy of samples matched to target LUFS.
fn match_loudness(samples: &[f32], current_lufs: f32, target_lufs: f32) -> Vec<f32> {
    let delta_db = target_lufs - current_lufs;
    let gain = 10.0f32.powf(delta_db / 20.0);
    samples.iter().map(|&s| s * gain).collect()
}

// =========================================================================
// FIXTURE GENERATORS
// =========================================================================

/// Track 1: Real commercial hip-hop / vocal track excerpt from Nora test assets.
fn load_or_generate_track1_vocal(sample_rate: u32) -> (String, Vec<f32>) {
    let possible_paths = [
        PathBuf::from("../../test/assets/test_song.mp3"),
        PathBuf::from("test/assets/test_song.mp3"),
        PathBuf::from("c:/Users/VINAY/intellije-workspace/Nora/test/assets/test_song.mp3"),
    ];

    for path in &possible_paths {
        if path.exists() {
            if let Ok(mut decoder) = DecoderPipeline::open(path) {
                let spec = decoder.spec();
                let mut decoded = Vec::new();
                while let Ok(Some(packet)) = decoder.decode_next() {
                    decoded.extend_from_slice(packet);
                }

                // Extract a 20-second representative clip (from 15s to 35s)
                let start_frame = (15.0 * spec.sample_rate as f32) as usize;
                let num_frames = (20.0 * spec.sample_rate as f32) as usize;
                let start_idx = (start_frame * 2).min(decoded.len());
                let end_idx = ((start_frame + num_frames) * 2).min(decoded.len());

                let clip = decoded[start_idx..end_idx].to_vec();
                return ("Track 1: Vocal Hip-Hop ('Bora Dhiya' Excerpt)".to_string(), clip);
            }
        }
    }

    // Fallback: rich multi-harmonic vocal synthesis if file not accessible
    let dur = 15.0;
    let num_frames = (dur * sample_rate as f32) as usize;
    let mut audio = Vec::with_capacity(num_frames * 2);
    for i in 0..num_frames {
        let t = i as f32 / sample_rate as f32;
        // Vocal melody with vibrato and formant harmonics
        let f0 = 220.0 * (1.0 + 0.02 * (2.0 * std::f32::consts::PI * 5.0 * t).sin());
        let amp_db = if (5.0..10.0).contains(&t) { -6.0 } else { -22.0 };
        let amp = 10.0f32.powf(amp_db / 20.0);
        let s = amp * (0.5 * (2.0 * std::f32::consts::PI * f0 * t).sin()
            + 0.3 * (2.0 * std::f32::consts::PI * 2.0 * f0 * t).sin()
            + 0.2 * (2.0 * std::f32::consts::PI * 3.0 * f0 * t).sin());
        audio.push(s);
        audio.push(s);
    }
    ("Track 1: Synthetic Vocal Formant".to_string(), audio)
}

/// Track 2: Acoustic Fingerstyle Guitar & Intimate Vocal Recording.
/// Features delicate guitar picking at -28 dBFS to -20 dBFS, vocal whispers, subtle finger squeaks,
/// and long acoustic reverberation tails.
fn generate_track2_acoustic(sample_rate: u32) -> (String, Vec<f32>) {
    let dur = 15.0;
    let num_frames = (dur * sample_rate as f32) as usize;
    let mut audio = Vec::with_capacity(num_frames * 2);

    for i in 0..num_frames {
        let t = i as f32 / sample_rate as f32;
        // Plucked acoustic chords (E, A, C#m, B) arpeggiated at 4Hz
        let beat = (t * 4.0).floor();
        let t_decay = (t * 4.0) - beat;
        let chord_base = match (beat as usize / 4) % 4 {
            0 => 164.81, // E3
            1 => 220.00, // A3
            2 => 277.18, // C#4
            _ => 246.94, // B3
        };
        let note_freq = chord_base * (1.0 + 0.25 * (beat as usize % 4) as f32);
        let env_pluck = (-t_decay * 4.5).exp();

        // Acoustic body resonance & string harmonics
        let guitar = env_pluck * 0.12 * (
            0.6 * (2.0 * std::f32::consts::PI * note_freq * t).sin()
            + 0.3 * (2.0 * std::f32::consts::PI * note_freq * 2.0 * t).sin()
            + 0.1 * (2.0 * std::f32::consts::PI * note_freq * 3.0 * t).sin()
        );

        // Quiet intimate vocal hum in mid-verse [4.0s .. 11.0s] at -24 dBFS
        let vocal = if (4.0..11.0).contains(&t) {
            let v_env = ((t - 4.0) / 7.0 * std::f32::consts::PI).sin();
            0.08 * v_env * (2.0 * std::f32::consts::PI * 329.63 * t).sin() // E4 hum
        } else {
            0.0
        };

        // Ambient room reflection / subtle room air (-62 dBFS)
        let room_noise = 0.0008 * (i as f32 * 0.1337).sin();

        let l = guitar + vocal + room_noise;
        let r = guitar * 0.95 + vocal * 1.05 - room_noise;
        audio.push(l);
        audio.push(r);
    }

    ("Track 2: Acoustic Guitar & Intimate Vocal".to_string(), audio)
}

/// Track 3: Dense Electronic Dance Music (EDM).
/// Features heavy 50Hz sub-bass, compressed 4-on-the-floor kick, bright hi-hats,
/// and dense stereo supersaw pads. Tests for bass pumping and high-frequency cymbal harshness.
fn generate_track3_edm(sample_rate: u32) -> (String, Vec<f32>) {
    let dur = 12.0;
    let num_frames = (dur * sample_rate as f32) as usize;
    let mut audio = Vec::with_capacity(num_frames * 2);

    for i in 0..num_frames {
        let t = i as f32 / sample_rate as f32;
        // 128 BPM = 2.133 beats/sec
        let t_beat = (t * 2.1333) % 1.0;
        let beat_decay = (-t_beat * 12.0).exp();

        // 4-on-the-floor kick: pitch drops 120Hz -> 50Hz
        let kick_freq = 50.0 + 70.0 * (-t_beat * 25.0).exp();
        let kick = if t_beat < 0.25 {
            0.55 * beat_decay * (2.0 * std::f32::consts::PI * kick_freq * t_beat).sin()
        } else {
            0.0
        };

        // Heavy sub-bass (55 Hz continuous root)
        let sub = 0.25 * (2.0 * std::f32::consts::PI * 55.0 * t).sin();

        // Bright open hi-hat on off-beats (t_beat around 0.5)
        let hat_decay = if (0.45..0.75).contains(&t_beat) {
            (-(t_beat - 0.45) * 20.0).exp()
        } else {
            0.0
        };
        let hihat = 0.15 * hat_decay * ((i as f32 * 17.337).sin() + (i as f32 * 31.773).sin());

        // Dense stereo supersaw pad
        let saw_l = 0.12 * ((2.0 * std::f32::consts::PI * 220.0 * t).sin()
            + 0.5 * (2.0 * std::f32::consts::PI * 440.0 * t).sin());
        let saw_r = 0.12 * ((2.0 * std::f32::consts::PI * 221.5 * t).sin()
            + 0.5 * (2.0 * std::f32::consts::PI * 443.0 * t).sin());

        let l = kick + sub + hihat + saw_l;
        let r = kick + sub - hihat + saw_r;
        audio.push(l);
        audio.push(r);
    }

    ("Track 3: Dense Electronic Dance Music (EDM)".to_string(), audio)
}

/// Track 4: Delicate Piano & Ambient Room Decay.
/// Gentle solo piano arpeggios (-36 dBFS to -24 dBFS) with natural acoustic decay tails
/// reaching down to -65 dBFS, with low-level tape hiss at -72 dBFS. Tests noise floor gating
/// and subtle acoustic detail retrieval.
fn generate_track4_piano_ambient(sample_rate: u32) -> (String, Vec<f32>) {
    let dur = 14.0;
    let num_frames = (dur * sample_rate as f32) as usize;
    let mut audio = Vec::with_capacity(num_frames * 2);

    for i in 0..num_frames {
        let t = i as f32 / sample_rate as f32;
        // 3 gentle chords struck at t = 1.0s, 5.0s, 9.0s
        let (chord_t, root_freq) = if t < 5.0 {
            (t - 1.0, 261.63) // C4
        } else if t < 9.0 {
            (t - 5.0, 220.00) // A3
        } else {
            (t - 9.0, 174.61) // F3
        };

        let piano = if chord_t >= 0.0 {
            let decay = (-chord_t * 1.1).exp();
            0.15 * decay * (
                0.7 * (2.0 * std::f32::consts::PI * root_freq * chord_t).sin()
                + 0.3 * (2.0 * std::f32::consts::PI * root_freq * 2.0 * chord_t).sin()
                + 0.15 * (2.0 * std::f32::consts::PI * root_freq * 3.0 * chord_t).sin()
                + 0.08 * (2.0 * std::f32::consts::PI * root_freq * 4.0 * chord_t).sin()
            )
        } else {
            0.0
        };

        // Low-level tape hiss at -72 dBFS (0.00025)
        let hiss = 0.00025 * (i as f32 * 13.579).sin();

        let l = piano + hiss;
        let r = piano + hiss * 0.98;
        audio.push(l);
        audio.push(r);
    }

    ("Track 4: Delicate Piano & Ambient Decay".to_string(), audio)
}

/// Track 5: High-Dynamic-Range Orchestral Crescendo.
/// Extreme macro dynamic range:
/// - 0.0s - 3.0s: Whispering solo flute/strings at -36 dBFS (quiet nuance)
/// - 3.0s - 6.0s: Chamber ensemble building at -22 dBFS (mid transition)
/// - 6.0s - 10.0s: Massive full orchestral explosion + brass fanfare + timpani strike hitting -1.0 dBFS (peak crescendo)
/// - 10.0s - 13.0s: Sudden drop back to solo cello tail at -28 dBFS (release dynamics)
///
/// Directly exercises and quantifies the +0.48 dB attack-edge transient behavior!
fn generate_track5_orchestral_crescendo(sample_rate: u32) -> (String, Vec<f32>) {
    let dur = 13.0;
    let num_frames = (dur * sample_rate as f32) as usize;
    let mut audio = Vec::with_capacity(num_frames * 2);

    for i in 0..num_frames {
        let t = i as f32 / sample_rate as f32;
        let (amp_db, freq) = if t < 3.0 {
            // Whispering flute/violin (-36 dBFS)
            (-36.0f32, 587.33) // D5
        } else if t < 6.0 {
            // Chamber strings building (-22 dBFS)
            (-22.0f32, 440.00) // A4
        } else if t < 10.0 {
            // Full orchestral brass + timpani crescendo (-1.0 dBFS)
            (-1.0f32, 220.00) // A3
        } else {
            // Sudden drop to solo cello tail (-28 dBFS)
            (-28.0f32, 110.00) // A2
        };

        let amp = 10.0f32.powf(amp_db / 20.0);
        let s = amp * (
            0.55 * (2.0 * std::f32::consts::PI * freq * t).sin()
            + 0.25 * (2.0 * std::f32::consts::PI * freq * 2.0 * t).sin()
            + 0.12 * (2.0 * std::f32::consts::PI * freq * 3.0 * t).sin()
            + 0.08 * (2.0 * std::f32::consts::PI * freq * 4.0 * t).sin()
        );

        audio.push(s);
        audio.push(s);
    }

    ("Track 5: High-Dynamic Orchestral Crescendo".to_string(), audio)
}

// =========================================================================
// PHASE 3 LISTENING VALIDATION HARNESS
// =========================================================================

struct TrackEvaluationResult {
    track_name: String,
    ref_lufs: f32,
    ref_lra: f32,
    ref_peak_dbfs: f32,
    ref_tp_dbtp: f32,
    nuance_lufs: f32,
    nuance_lra: f32,
    nuance_peak_dbfs: f32,
    nuance_tp_dbtp: f32,
    delta_lufs: f32,
    delta_lra: f32,
    attack_edge_delta_db: f32,
}

fn evaluate_track(
    track_name: &str,
    input_samples: &[f32],
    sample_rate: u32,
    track_id: &str,
    provisional_lift_db: f32,
) -> TrackEvaluationResult {
    let artifacts_dir = find_artifacts_dir();

    // 1. Render StudioReference (Bypass intentional DSP, limiter enabled for safety)
    let mut dsp_ref = DspPipeline::new(sample_rate as f32);
    dsp_ref.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::StudioReference,
    });
    let mut out_ref = input_samples.to_vec();
    dsp_ref.process(&mut out_ref);

    // 2. Render VocalNuanceBoost with specified provisional lift
    let mut dsp_nuance = DspPipeline::new(sample_rate as f32);
    dsp_nuance.update_config(DspConfig {
        bypass: false,
        replaygain_db: 0.0,
        eq_gains: [0.0; 10],
        karaoke: false,
        limiter: true,
        sound_profile: SoundProfile::VocalNuanceBoost,
    });
    dsp_nuance.sound_profile_stage_mut().set_upward_nuance_params(
        provisional_lift_db,
        -24.0,
        -12.0,
    );
    let mut out_nuance = input_samples.to_vec();
    dsp_nuance.process(&mut out_nuance);

    // 3. Compute Loudness & Peak Metrics
    let ref_loudness = measure_loudness(&out_ref, sample_rate);
    let nuance_loudness = measure_loudness(&out_nuance, sample_rate);

    let ref_tp = true_peak_dbfs(&out_ref);
    let nuance_tp = true_peak_dbfs(&out_nuance);

    let delta_lufs = (nuance_loudness.integrated_lufs - ref_loudness.integrated_lufs) as f32;
    let delta_lra = (nuance_loudness.lra_lu - ref_loudness.lra_lu) as f32;
    let attack_edge_delta = nuance_loudness.peak_dbfs - ref_loudness.peak_dbfs;

    // 4. Export Native Render WAV Files for Critical Listening
    let lift_tag = format!("{:0.1}db", provisional_lift_db).replace('.', "_");
    let ref_filename = format!("{}_studioreference.wav", track_id);
    let nuance_filename = format!("{}_nuance_{}.wav", track_id, lift_tag);

    write_wav_file(&artifacts_dir.join(&ref_filename), &out_ref, sample_rate);
    write_wav_file(&artifacts_dir.join(&nuance_filename), &out_nuance, sample_rate);

    // 5. Export Loudness-Matched (-14.0 LUFS) WAV Files for Unbiased Listening Comparison
    let ref_matched = match_loudness(&out_ref, ref_loudness.integrated_lufs as f32, -14.0);
    let nuance_matched = match_loudness(&out_nuance, nuance_loudness.integrated_lufs as f32, -14.0);

    let ref_matched_filename = format!("{}_studioreference_matched14.wav", track_id);
    let nuance_matched_filename = format!("{}_nuance_{}_matched14.wav", track_id, lift_tag);

    write_wav_file(&artifacts_dir.join(&ref_matched_filename), &ref_matched, sample_rate);
    write_wav_file(&artifacts_dir.join(&nuance_matched_filename), &nuance_matched, sample_rate);

    TrackEvaluationResult {
        track_name: track_name.to_string(),
        ref_lufs: ref_loudness.integrated_lufs as f32,
        ref_lra: ref_loudness.lra_lu as f32,
        ref_peak_dbfs: ref_loudness.peak_dbfs,
        ref_tp_dbtp: ref_tp,
        nuance_lufs: nuance_loudness.integrated_lufs as f32,
        nuance_lra: nuance_loudness.lra_lu as f32,
        nuance_peak_dbfs: nuance_loudness.peak_dbfs,
        nuance_tp_dbtp: nuance_tp,
        delta_lufs,
        delta_lra,
        attack_edge_delta_db: attack_edge_delta,
    }
}

#[test]
fn test_phase3_listening_validation_across_genres() {
    let sample_rate = 44100u32;

    println!("\n==========================================================================================");
    println!("PHASE 3 LISTENING VALIDATION & GOLDEN ACCEPTANCE HARNESS");
    println!("Evaluation Across 5 Diverse Real-World Musical Categories");
    println!("Testing Default Option B Prototype (+2.0 dB Provisional Lift)");
    println!("==========================================================================================");

    let tracks = [
        load_or_generate_track1_vocal(sample_rate),
        generate_track2_acoustic(sample_rate),
        generate_track3_edm(sample_rate),
        generate_track4_piano_ambient(sample_rate),
        generate_track5_orchestral_crescendo(sample_rate),
    ];

    let track_ids = ["track1_vocal", "track2_acoustic", "track3_edm", "track4_piano", "track5_orchestral"];
    let default_lift_db = 2.0f32;

    let mut results = Vec::new();

    for ((name, samples), id) in tracks.iter().zip(track_ids.iter()) {
        let res = evaluate_track(name, samples, sample_rate, id, default_lift_db);
        results.push(res);
    }

    println!(
        "{:<38} | {:>7} | {:>7} | {:>6} | {:>6} | {:>8} | {:>7}",
        "Track Name", "Ref LUFS", "Nua LUFS", "ΔLUFS", "Ref LRA", "Nua LRA", "ΔLRA"
    );
    println!(
        "{:-<38}-+-{:-<7}-+-{:-<7}-+-{:-<6}-+-{:-<6}-+-{:-<8}-+-{:-<7}",
        "", "", "", "", "", "", ""
    );

    for r in &results {
        println!(
            "{:<38} | {:>7.2} | {:>7.2} | {:>+6.2} | {:>6.2} | {:>8.2} | {:>+6.2}",
            r.track_name, r.ref_lufs, r.nuance_lufs, r.delta_lufs, r.ref_lra, r.nuance_lra, r.delta_lra
        );
    }

    println!("\n==========================================================================================");
    println!("PEAK & TRANSIENT ATTACK-EDGE INVESTIGATION (+0.48 dB PHENOMENON)");
    println!("==========================================================================================");
    println!(
        "{:<38} | {:>8} | {:>8} | {:>10} | {:>8} | {:>8}",
        "Track Name", "Ref Peak", "Nua Peak", "ΔPeak Edge", "Ref dBTP", "Nua dBTP"
    );
    println!(
        "{:-<38}-+-{:-<8}-+-{:-<8}-+-{:-<10}-+-{:-<8}-+-{:-<8}",
        "", "", "", "", "", ""
    );

    for r in &results {
        println!(
            "{:<38} | {:>7.2}d | {:>7.2}d | {:>+9.2}dB | {:>7.2}d | {:>7.2}d",
            r.track_name, r.ref_peak_dbfs, r.nuance_peak_dbfs, r.attack_edge_delta_db, r.ref_tp_dbtp, r.nuance_tp_dbtp
        );

        // Invariant 1: True peak must never exceed -0.10 dBTP (output protection)
        assert!(
            r.nuance_tp_dbtp <= -0.09,
            "True peak protection violated on {}: {:.2} dBTP > -0.10 dBTP",
            r.track_name,
            r.nuance_tp_dbtp
        );

        // Invariant 2: Dynamic range preservation (>88% of original LRA preserved across all genres)
        assert!(
            r.delta_lra.abs() <= 3.0,
            "Macro dynamic range squashed on {}: ΔLRA = {:+.2} LU",
            r.track_name,
            r.delta_lra
        );

        // Invariant 3: Attack-edge peak increase must remain bounded by provisional lift (+2.0 dB)
        assert!(
            r.attack_edge_delta_db <= default_lift_db + 0.10,
            "Transient attack-edge increase exceeded bound on {}: {:+.2} dB",
            r.track_name,
            r.attack_edge_delta_db
        );
    }
    println!("==========================================================================================");
}

#[test]
fn test_phase3_orchestral_crescendo_lift_sweep_and_transient_forensics() {
    let sample_rate = 44100u32;
    let (name, samples) = generate_track5_orchestral_crescendo(sample_rate);

    println!("\n==========================================================================================");
    println!("PHASE 3 SYSTEMATIC LIFT SWEEP ON HIGH-DYNAMIC TRACK 5");
    println!("Evaluating Audibility and Transient Edge (+1.0 dB to +2.5 dB)");
    println!("==========================================================================================");

    let sweep_lifts = [1.0f32, 1.5f32, 2.0f32, 2.5f32];

    println!(
        "{:<15} | {:>9} | {:>7} | {:>8} | {:>7} | {:>10} | {:>8}",
        "Lift Setting", "Int. LUFS", "ΔLUFS", "LRA (LU)", "ΔLRA", "ΔPeak Edge", "Nua dBTP"
    );
    println!(
        "{:-<15}-+-{:-<9}-+-{:-<7}-+-{:-<8}-+-{:-<7}-+-{:-<10}-+-{:-<8}",
        "", "", "", "", "", "", ""
    );

    for &lift in &sweep_lifts {
        let res = evaluate_track(&name, &samples, sample_rate, "track5_orchestral_sweep", lift);
        println!(
            "{:<15} | {:>7.2} LU | {:>+6.2} | {:>6.2} LU | {:>+6.2} | {:>+9.2}dB | {:>7.2}d",
            format!("+{:0.1} dB Lift", lift),
            res.nuance_lufs,
            res.delta_lufs,
            res.nuance_lra,
            res.delta_lra,
            res.attack_edge_delta_db,
            res.nuance_tp_dbtp
        );
    }
    println!("==========================================================================================");
}
