import type { ChannelPosition, DecodeChunk } from './types';

export interface LoudnessResult {
  /** Integrated loudness in LUFS (or -Infinity if completely silent or shorter than 400ms gating window) */
  integratedLoudness: number;
  /** Maximum absolute discrete sample value observed (0.0 to 1.0+). Note: this is discrete sample peak, NOT true peak. */
  samplePeak: number;
  /** Peak discrete sample value in dBFS (20 * log10(samplePeak)) */
  samplePeakDb: number;
  /** True peak oversampled metric per BS.1770-4 Annex 2 - explicitly null in Gate D2 (deferred) */
  truePeak: null;
  /** Duration in seconds processed */
  duration: number;
  /** Total sample frames processed */
  totalSamples: number;
  /** Total 400ms blocks evaluated */
  blocksProcessed: number;
  /** Total 400ms blocks surviving after dual-stage gating */
  blocksSurvivingGate: number;
}

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export interface BiquadState {
  s1: number;
  s2: number;
}

/**
 * Calculates ITU-R BS.1770-4 K-weighting filter coefficients dynamically
 * for arbitrary sample rates using exact bilinear transformation with pre-warping
 * conforming bit-for-bit to ITU-R BS.1770-4 Table 1 & Table 2.
 */
export function getKWeightingCoefficients(sampleRate: number): {
  stage1: BiquadCoefficients;
  stage2: BiquadCoefficients;
} {
  // Stage 1: Pre-Filter (High-Shelf Filter)
  const db = 3.999843853973347;
  const f0_stage1 = 1681.974450955533;
  const Q_stage1 = 0.7071752369554196;
  const K1 = Math.tan((Math.PI * f0_stage1) / sampleRate);
  const Vh = Math.pow(10.0, db / 20.0);
  const Vb = Math.pow(Vh, 0.4996667741545416);

  const a0_1 = 1.0 + (K1 / Q_stage1) + (K1 * K1);
  const stage1: BiquadCoefficients = {
    b0: (Vh + ((Vb * K1) / Q_stage1) + (K1 * K1)) / a0_1,
    b1: (2.0 * ((K1 * K1) - Vh)) / a0_1,
    b2: (Vh - ((Vb * K1) / Q_stage1) + (K1 * K1)) / a0_1,
    a1: (2.0 * ((K1 * K1) - 1.0)) / a0_1,
    a2: (1.0 - (K1 / Q_stage1) + (K1 * K1)) / a0_1
  };

  // Stage 2: RLB Filter (High-Pass Filter)
  const f0_stage2 = 38.13547087602444;
  const Q_stage2 = 0.5003270373238773;
  const K2 = Math.tan((Math.PI * f0_stage2) / sampleRate);

  const a0_2 = 1.0 + (K2 / Q_stage2) + (K2 * K2);
  const stage2: BiquadCoefficients = {
    b0: 1.0 / a0_2,
    b1: -2.0 / a0_2,
    b2: 1.0 / a0_2,
    a1: (2.0 * ((K2 * K2) - 1.0)) / a0_2,
    a2: (1.0 - (K2 / Q_stage2) + (K2 * K2)) / a0_2
  };

  return { stage1, stage2 };
}

/**
 * Returns the ITU-R BS.1770-4 channel energy weighting G_i for a given semantic position.
 * Throws on unknown or unmapped multichannel positions to prevent silent mis-weighting.
 */
export function getChannelWeighting(position?: ChannelPosition): number {
  if (!position || position === 'Unknown') {
    throw new Error('Cannot compute BS.1770 loudness for unknown channel position. Explicit channel layout required.');
  }
  switch (position) {
    case 'Ls':
    case 'Rs':
      return 1.4125375446227544; // +1.5 dB (approx sqrt(2))
    case 'LFE':
      return 0.0; // LFE channel is excluded from loudness calculation per BS.1770-4
    case 'L':
    case 'R':
    case 'C':
    case 'Mono':
      return 1.0; // 0.0 dB
    default:
      throw new Error(`Unsupported channel position: ${String(position)}`);
  }
}

/**
 * Streaming ITU-R BS.1770-4 / EBU R128 Loudness Engine.
 * - Frame processing is strictly O(1) computation and O(1) DSP state using Transposed Direct Form II
 *   and a sliding O(1) rolling energy ring buffer.
 * - Dual-stage gating stores block energies at O(N_blocks) where N_blocks ~= 10 per second
 *   (e.g. ~280 KB for a 1-hour audio track), eliminating any whole-file raw PCM buffering.
 */
export class BS1770LoudnessEngine {
  private readonly sampleRate: number;
  private readonly blockSize: number; // 400ms in frames
  private readonly hopSize: number; // 100ms in frames

  private readonly stage1Coeffs: BiquadCoefficients;
  private readonly stage2Coeffs: BiquadCoefficients;

  private stage1States: BiquadState[] = [];
  private stage2States: BiquadState[] = [];
  private channelWeights: number[] = [];

  // O(1) Rolling energy buffer for 400ms block with 100ms hop
  private blockRingBuffer: Float64Array;
  private rollingEnergySum: number = 0.0;
  private ringWriteIndex: number = 0;
  private samplesAccumulated: number = 0;
  private nextHopTarget: number = 0;

  // Stored 400ms block energies (approx 10 floats per second of audio)
  private blockEnergies: number[] = [];

  // Metrics
  private maxSamplePeak: number = 0.0;
  private totalFramesProcessed: number = 0;
  private finalizedResult: LoudnessResult | null = null;

  constructor(sampleRate = 44100, channelCount = 2, channelLayout?: ChannelPosition[]) {
    this.sampleRate = Math.max(8000, sampleRate);
    this.blockSize = Math.floor(0.4 * this.sampleRate);
    this.hopSize = Math.floor(0.1 * this.sampleRate);
    this.nextHopTarget = this.blockSize;

    const coeffs = getKWeightingCoefficients(this.sampleRate);
    this.stage1Coeffs = coeffs.stage1;
    this.stage2Coeffs = coeffs.stage2;

    this.initChannels(channelCount, channelLayout);
    this.blockRingBuffer = new Float64Array(this.blockSize);
  }

  private initChannels(channelCount: number, channelLayout?: ChannelPosition[]) {
    this.stage1States = Array.from({ length: channelCount }, () => ({ s1: 0, s2: 0 }));
    this.stage2States = Array.from({ length: channelCount }, () => ({ s1: 0, s2: 0 }));

    this.channelWeights = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const position = channelLayout?.[ch] ?? (channelCount === 1 ? 'Mono' : ch === 0 ? 'L' : ch === 1 ? 'R' : 'Unknown');
      this.channelWeights.push(getChannelWeighting(position));
    }
  }

  /**
   * Consumes a bounded PCM chunk from the audio decoder stream.
   * Throws if engine has already been finalized.
   */
  public processChunk(chunk: DecodeChunk): void {
    if (this.finalizedResult !== null) {
      throw new Error('BS1770LoudnessEngine has already been finalized. Cannot process additional chunks.');
    }

    const { channelData, frameCount, channelLayout } = chunk;
    const numChannels = channelData.length;
    if (numChannels === 0 || frameCount === 0) return;

    if (numChannels !== this.stage1States.length) {
      this.initChannels(numChannels, channelLayout);
    }

    for (let f = 0; f < frameCount; f++) {
      let weightedFrameEnergy = 0.0;

      for (let ch = 0; ch < numChannels; ch++) {
        const rawSample = channelData[ch][f];
        const absVal = Math.abs(rawSample);
        if (absVal > this.maxSamplePeak) {
          this.maxSamplePeak = absVal;
        }

        const weight = this.channelWeights[ch];
        if (weight === 0.0) continue; // Skip LFE

        // Stage 1: Pre-filter (Transposed Direct Form II)
        const s1_state = this.stage1States[ch];
        const y1 = (this.stage1Coeffs.b0 * rawSample) + s1_state.s1;
        s1_state.s1 = (this.stage1Coeffs.b1 * rawSample) - (this.stage1Coeffs.a1 * y1) + s1_state.s2;
        s1_state.s2 = (this.stage1Coeffs.b2 * rawSample) - (this.stage1Coeffs.a2 * y1);

        // Stage 2: RLB filter (Transposed Direct Form II)
        const s2_state = this.stage2States[ch];
        const y2 = (this.stage2Coeffs.b0 * y1) + s2_state.s1;
        s2_state.s1 = (this.stage2Coeffs.b1 * y1) - (this.stage2Coeffs.a1 * y2) + s2_state.s2;
        s2_state.s2 = (this.stage2Coeffs.b2 * y1) - (this.stage2Coeffs.a2 * y2);

        weightedFrameEnergy += weight * (y2 * y2);
      }

      // O(1) Sliding rolling energy accumulator
      const oldSampleEnergy = this.blockRingBuffer[this.ringWriteIndex];
      this.rollingEnergySum += weightedFrameEnergy - oldSampleEnergy;
      this.blockRingBuffer[this.ringWriteIndex] = weightedFrameEnergy;

      this.ringWriteIndex = (this.ringWriteIndex + 1) % this.blockSize;
      this.samplesAccumulated++;
      this.totalFramesProcessed++;

      // When a 100ms hop boundary is reached after at least 400ms of audio
      if (this.samplesAccumulated >= this.nextHopTarget) {
        const meanSquare = Math.max(0.0, this.rollingEnergySum / this.blockSize);
        this.blockEnergies.push(meanSquare);

        this.nextHopTarget += this.hopSize;
      }
    }
  }

  /**
   * Returns a defensive snapshot of the accumulated 400ms block energies.
   * Preserves full 64-bit IEEE 754 precision for album aggregation and testing.
   */
  public getBlockEnergies(): Float64Array {
    return Float64Array.from(this.blockEnergies);
  }

  /**
   * Finalizes the calculation and returns the pure LoudnessResult with dual-stage gating.
   * This method is idempotent: subsequent calls return the cached final result.
   */
  public finish(): LoudnessResult {
    if (this.finalizedResult !== null) {
      return this.finalizedResult;
    }

    const duration = this.totalFramesProcessed / this.sampleRate;
    const samplePeak = this.maxSamplePeak;
    const samplePeakDb = samplePeak > 0 ? 20 * Math.log10(samplePeak) : -Infinity;

    const gated = calculateIntegratedLoudnessFromBlocks(this.blockEnergies);

    this.finalizedResult = {
      integratedLoudness: gated.integratedLoudness,
      samplePeak: Math.round(samplePeak * 10000) / 10000,
      samplePeakDb: Number.isFinite(samplePeakDb) ? Math.round(samplePeakDb * 100) / 100 : -Infinity,
      truePeak: null,
      duration: Math.round(duration * 100) / 100,
      totalSamples: this.totalFramesProcessed,
      blocksProcessed: gated.blocksProcessed,
      blocksSurvivingGate: gated.blocksSurvivingGate
    };
    return this.finalizedResult;
  }
}

export interface GatedLoudnessResult {
  integratedLoudness: number;
  blocksProcessed: number;
  blocksSurvivingGate: number;
}

/**
 * Pure ITU-R BS.1770-4 / EBU R128 dual-stage gating calculation over an array of 400ms block energies.
 * Used for both per-track loudness finalization and multi-track album aggregation.
 *
 * 1. Absolute Threshold Gating: -70.0 LKFS over all blocks.
 * 2. Ungated mean loudness over blocks surviving the absolute gate.
 * 3. Relative Threshold Gating: ungated loudness - 10.0 LU.
 * 4. Final mean energy over blocks surviving the relative gate -> integrated LUFS.
 */
export function calculateIntegratedLoudnessFromBlocks(
  blockEnergies: ArrayLike<number>
): GatedLoudnessResult {
  const blocksProcessed = blockEnergies.length;
  if (blocksProcessed === 0) {
    return {
      integratedLoudness: -Infinity,
      blocksProcessed: 0,
      blocksSurvivingGate: 0
    };
  }

  // Step 1: Absolute Threshold Gating (-70.0 LKFS)
  const absoluteGatedEnergies: number[] = [];
  for (let i = 0; i < blocksProcessed; i++) {
    const z = blockEnergies[i];
    if (z <= 0) continue;
    const lkfs = -0.691 + (10 * Math.log10(z));
    if (lkfs >= -70.0) {
      absoluteGatedEnergies.push(z);
    }
  }

  if (absoluteGatedEnergies.length === 0) {
    return {
      integratedLoudness: -Infinity,
      blocksProcessed,
      blocksSurvivingGate: 0
    };
  }

  // Step 2: Calculate un-gated loudness from absolute surviving blocks
  let absEnergySum = 0.0;
  for (let i = 0; i < absoluteGatedEnergies.length; i++) {
    absEnergySum += absoluteGatedEnergies[i];
  }
  const ungatedMeanEnergy = absEnergySum / absoluteGatedEnergies.length;
  const ungatedLoudness = -0.691 + (10 * Math.log10(ungatedMeanEnergy));

  // Step 3: Relative Threshold Gating (ungatedLoudness - 10.0 LU)
  const relativeThresholdLkfs = ungatedLoudness - 10.0;
  const relativeGatedEnergies: number[] = [];
  for (let i = 0; i < absoluteGatedEnergies.length; i++) {
    const z = absoluteGatedEnergies[i];
    const lkfs = -0.691 + (10 * Math.log10(z));
    if (lkfs >= relativeThresholdLkfs) {
      relativeGatedEnergies.push(z);
    }
  }

  if (relativeGatedEnergies.length === 0) {
    return {
      integratedLoudness: -Infinity,
      blocksProcessed,
      blocksSurvivingGate: 0
    };
  }

  // Step 4: Integrated Loudness over relative surviving blocks
  let relEnergySum = 0.0;
  for (let i = 0; i < relativeGatedEnergies.length; i++) {
    relEnergySum += relativeGatedEnergies[i];
  }
  const finalMeanEnergy = relEnergySum / relativeGatedEnergies.length;
  const integratedLoudness = -0.691 + (10 * Math.log10(finalMeanEnergy));

  return {
    integratedLoudness: Math.round(integratedLoudness * 100) / 100,
    blocksProcessed,
    blocksSurvivingGate: relativeGatedEnergies.length
  };
}
