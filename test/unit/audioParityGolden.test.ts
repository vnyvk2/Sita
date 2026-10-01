import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  OptionBShaper,
  VocalNuanceNode,
  VOCAL_NUANCE_MAKEUP_DB,
  VOCAL_NUANCE_PARAMS
} from '../../src/renderer/src/other/audioFx/vocalNuanceNode';

const SAMPLE_RATE = 48000;

function computePeakDb(samples: Float32Array): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > max) max = abs;
  }
  return max > 0 ? 20 * Math.log10(max) : -140;
}

function computeRmsDb(samples: Float32Array): number {
  if (samples.length === 0) return -140;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const meanSq = sumSq / samples.length;
  return meanSq > 0 ? 10 * Math.log10(meanSq) : -140;
}

function computeCancellationDepth(refSig: Float32Array, testSig: Float32Array): number {
  expect(refSig.length).toBe(testSig.length);
  let refP = 0;
  let diffP = 0;
  for (let i = 0; i < refSig.length; i++) {
    const r = refSig[i];
    const d = testSig[i] - r;
    refP += r * r;
    diffP += d * d;
  }
  if (diffP <= 1e-24 || diffP === 0) {
    return 240.0;
  }
  return 10 * Math.log10(refP / diffP);
}

/**
 * Generates the identical deterministic 4-stage test signal: Total duration: 4.0 seconds (192,000
 * stereo frames = 384,000 f32 samples) Stage 1 (0.0s..1.0s): Quiet region (-30 dBFS, 1000Hz sine)
 * Stage 2 (1.0s..2.0s): Shoulder transition (-18 dBFS, 1000Hz sine) Stage 3 (2.0s..3.0s): Loud
 * region (-3 dBFS, 1000Hz sine) Stage 4 (3.0s..4.0s): Transient dynamic step response: -
 * 3.00s..3.20s: -30 dBFS - 3.20s..3.50s: -3 dBFS (sudden +27 dB jump: tests 15ms attack) -
 * 3.50s..4.00s: -30 dBFS (sudden -27 dB drop: tests 250ms release)
 */
function generateDeterministic4StageFixture(): Float32Array {
  const totalFrames = 4.0 * SAMPLE_RATE;
  const buffer = new Float32Array(totalFrames * 2);

  const ampQuiet = Math.pow(10, -30.0 / 20.0);
  const ampShoulder = Math.pow(10, -18.0 / 20.0);
  const ampLoud = Math.pow(10, -3.0 / 20.0);
  const freq = 1000.0;

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / SAMPLE_RATE;
    let amp: number;
    if (t < 1.0) {
      amp = ampQuiet;
    } else if (t < 2.0) {
      amp = ampShoulder;
    } else if (t < 3.0) {
      amp = ampLoud;
    } else {
      const tRel = t - 3.0;
      if (tRel < 0.2) {
        amp = ampQuiet;
      } else if (tRel < 0.5) {
        amp = ampLoud;
      } else {
        amp = ampQuiet;
      }
    }

    const sample = amp * Math.sin(2.0 * Math.PI * freq * t);
    buffer[frame * 2] = sample; // Left
    buffer[frame * 2 + 1] = sample; // Right
  }

  return buffer;
}

interface GoldenReferenceDoc {
  sample_rate: number;
  total_frames: number;
  studio_reference: {
    cancellation_depth_db: number;
    max_sample_abs_diff: number;
    delta_peak_db: number;
    delta_rms_db: number;
  };
  vocal_nuance_boost: {
    quiet_gain_db: number;
    shoulder_gain_db: number;
    loud_gain_db: number;
    loud_peak_dbfs: number;
    attack_settled_gain: number;
    release_intermediate_gain: number;
  };
}

function loadRustGoldenReference(): GoldenReferenceDoc | null {
  const candidatePaths = [
    path.resolve(
      __dirname,
      '../../crates/engine-testkit/target/parity_artifacts/golden_fixture_reference.json'
    ),
    path.resolve(__dirname, '../../target/parity_artifacts/golden_fixture_reference.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      return JSON.parse(content) as GoldenReferenceDoc;
    }
  }
  return null;
}

describe('Golden Audio-Fixture Parity Verification (Rust vs Web Audio)', () => {
  it('verifies Studio Reference digital null parity (>= 240 dB cancellation depth)', () => {
    const input = generateDeterministic4StageFixture();
    const output = new Float32Array(input);

    const shaper = new OptionBShaper(SAMPLE_RATE);
    // Studio Reference: alpha = 0.0 (bypass)
    shaper.processInterleaved(output, 0.0);

    const cancellation = computeCancellationDepth(input, output);
    const inPeak = computePeakDb(input);
    const outPeak = computePeakDb(output);
    const inRms = computeRmsDb(input);
    const outRms = computeRmsDb(output);

    expect(cancellation).toBeGreaterThanOrEqual(240.0);
    expect(Math.abs(outPeak - inPeak)).toBeLessThan(1e-6);
    expect(Math.abs(outRms - inRms)).toBeLessThan(1e-6);
  });

  it('verifies Vocal Nuance Boost Option B mathematical parity across 4 stages', () => {
    const input = generateDeterministic4StageFixture();
    const output = new Float32Array(input);

    const shaper = new OptionBShaper(SAMPLE_RATE);

    // Warm up profile so alpha = 1.0 is active at t=0
    const warmup = new Float32Array(1440 * 2);
    shaper.processInterleaved(warmup, 1.0);

    shaper.processInterleaved(output, 1.0);

    // 1. Stage 1 (Quiet region, t in [0.5, 1.0]s = frames 24000..48000)
    const quietOut = output.subarray(24000 * 2, 48000 * 2);
    const quietIn = input.subarray(24000 * 2, 48000 * 2);
    const quietGainDb = computePeakDb(quietOut) - computePeakDb(quietIn);
    expect(quietGainDb).toBeCloseTo(1.477, 2);
    expect(Math.abs(quietGainDb - 1.5)).toBeLessThan(0.05);

    // 2. Stage 2 (Shoulder transition, t in [1.5, 2.0]s = frames 72000..96000)
    const shoulderOut = output.subarray(72000 * 2, 96000 * 2);
    const shoulderIn = input.subarray(72000 * 2, 96000 * 2);
    const shoulderGainDb = computePeakDb(shoulderOut) - computePeakDb(shoulderIn);
    // Envelope settles at -18.9 dBFS due to 250ms inter-crest ripple, Hermite spline gives +0.908 dB
    expect(shoulderGainDb).toBeCloseTo(0.908, 2);

    // 3. Stage 3 (Loud region, t in [2.5, 3.0]s = frames 120000..144000)
    const loudOut = output.subarray(120000 * 2, 144000 * 2);
    const loudIn = input.subarray(120000 * 2, 144000 * 2);
    const loudGainDb = computePeakDb(loudOut) - computePeakDb(loudIn);
    const loudPeakDbfs = computePeakDb(loudOut);

    // Product Invariant: Loud material MUST remain untouched at unity gain (0.00 dB)
    expect(Math.abs(loudGainDb)).toBeLessThan(0.005);
    expect(loudPeakDbfs).toBeCloseTo(-3.0, 2);

    // Contrasting against downward compressor with makeup gain:
    // A standard downward compressor (-12 dBFS threshold, 1.25:1 ratio, +1.5 dB makeup)
    // would attenuate the -3 dBFS tone to -3.9 dBFS (-0.9 dB attenuation).
    // OptionBShaper preserves the crest with zero attenuation:
    const compressorAttenuatedPeak = -3.0 - ((-3.0 - -12.0) * (1 - 1 / 1.25) - 1.5);
    expect(compressorAttenuatedPeak).toBeCloseTo(-3.3, 1);
    expect(loudPeakDbfs).toBeGreaterThan(compressorAttenuatedPeak + 0.25);

    // 4. Stage 4: Transient dynamic step response
    // Attack response: 45ms post-jump (frame 155760)
    const attackSampleIdx = 155760 * 2;
    const attackGain = Math.abs(output[attackSampleIdx]) / Math.abs(input[attackSampleIdx]);
    expect(attackGain).toBeCloseTo(1.0, 3);

    // Release holdoff: 50ms post-drop (frame 170400)
    const holdoffSampleIdx = 170400 * 2;
    const holdoffGain = Math.abs(output[holdoffSampleIdx]) / Math.abs(input[holdoffSampleIdx]);
    // Anti-pumping holdoff: gain remains strictly at unity while envelope > -12 dBFS
    expect(holdoffGain).toBeCloseTo(1.0, 3);

    // Release recovery: 450ms post-drop (frame 189600)
    const recoverSampleIdx = 189600 * 2;
    const recoverGain = Math.abs(output[recoverSampleIdx]) / Math.abs(input[recoverSampleIdx]);
    expect(recoverGain).toBeGreaterThanOrEqual(1.01);
    expect(recoverGain).toBeLessThanOrEqual(1.08);

    // 5. Cross-Verification against Rust Golden Reference file
    const rustRef = loadRustGoldenReference();
    if (rustRef) {
      expect(quietGainDb).toBeCloseTo(rustRef.vocal_nuance_boost.quiet_gain_db, 2);
      expect(shoulderGainDb).toBeCloseTo(rustRef.vocal_nuance_boost.shoulder_gain_db, 2);
      expect(loudGainDb).toBeCloseTo(rustRef.vocal_nuance_boost.loud_gain_db, 2);
      expect(loudPeakDbfs).toBeCloseTo(rustRef.vocal_nuance_boost.loud_peak_dbfs, 2);
      expect(attackGain).toBeCloseTo(rustRef.vocal_nuance_boost.attack_settled_gain, 3);
      expect(recoverGain).toBeCloseTo(rustRef.vocal_nuance_boost.release_intermediate_gain, 3);
    }
  });

  it('proves sample-by-sample cancellation depth (> 140 dB) between TS and reference model', () => {
    const input = generateDeterministic4StageFixture();
    const outputTs = new Float32Array(input);
    const outputRef = new Float32Array(input);

    const shaper = new OptionBShaper(SAMPLE_RATE);
    shaper.processInterleaved(outputTs, 1.0);

    // Reference mathematical evaluation matching SoundProfileStage
    let envelope = 0.0;
    let gain = 1.0;
    const attCoeff = Math.exp(-1.0 / (0.015 * SAMPLE_RATE));
    const relCoeff = Math.exp(-1.0 / (0.25 * SAMPLE_RATE));

    for (let i = 0; i < outputRef.length; i += 2) {
      const peak = Math.max(Math.abs(outputRef[i]), Math.abs(outputRef[i + 1]));
      if (peak > envelope) {
        envelope = attCoeff * envelope + (1.0 - attCoeff) * peak;
      } else {
        envelope = relCoeff * envelope + (1.0 - relCoeff) * peak;
      }

      const envDb = 20.0 * Math.log10(Math.max(1e-6, envelope));
      let targetLiftDb = 0.0;
      if (envDb >= -12.0) {
        targetLiftDb = 0.0;
      } else if (envDb > -24.0) {
        const u = (envDb - -24.0) / (-12.0 - -24.0);
        const s = 1.0 - (3.0 * u * u - 2.0 * u * u * u);
        targetLiftDb = 1.5 * s;
      } else if (envDb >= -60.0) {
        targetLiftDb = 1.5;
      } else if (envDb > -80.0) {
        const v = (envDb - -80.0) / (-60.0 - -80.0);
        const sGate = 3.0 * v * v - 2.0 * v * v * v;
        targetLiftDb = 1.5 * sGate;
      } else {
        targetLiftDb = 0.0;
      }

      const targetG = Math.pow(10.0, targetLiftDb / 20.0);
      if (targetG < gain) {
        gain = attCoeff * gain + (1.0 - attCoeff) * targetG;
      } else {
        gain = relCoeff * gain + (1.0 - relCoeff) * targetG;
      }

      outputRef[i] *= gain;
      outputRef[i + 1] *= gain;
    }

    const cancellation = computeCancellationDepth(outputRef, outputTs);
    expect(cancellation).toBeGreaterThanOrEqual(140.0);

    let maxSampleDiff = 0.0;
    for (let i = 0; i < outputTs.length; i++) {
      const diff = Math.abs(outputTs[i] - outputRef[i]);
      if (diff > maxSampleDiff) maxSampleDiff = diff;
    }
    expect(maxSampleDiff).toBeLessThan(1e-6);
  });
});
