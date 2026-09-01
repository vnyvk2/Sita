import { describe, expect, it } from 'vitest';

import type { LoudnessResult } from '../../../../../src/main/workers/process/audio/BS1770LoudnessEngine';
import { calculateReplayGainMetrics } from '../../../../../src/main/workers/process/audio/ReplayGainPolicy';

describe('Gate D2-R1: ReplayGainPolicy (Decoupled Nora Gain Policy)', () => {
  it('calculates trackGain relative to Nora default -18.0 LUFS target', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -14.0, // 4 dB louder than target
      samplePeak: 0.95,
      samplePeakDb: -0.45,
      truePeak: null,
      duration: 180,
      totalSamples: 7938000,
      blocksProcessed: 1800,
      blocksSurvivingGate: 1750
    };

    const metrics = calculateReplayGainMetrics(loudness);
    expect(metrics.targetLufs).toBe(-18.0);
    expect(metrics.trackGain).toBe(-4.0); // -18 - (-14) = -4.0 dB
    expect(metrics.trackPeak).toBe(0.95);
    expect(metrics.integratedLoudness).toBe(-14.0);
  });

  it('calculates positive trackGain for quieter material', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -23.0, // 5 dB quieter than target
      samplePeak: 0.5,
      samplePeakDb: -6.02,
      truePeak: null,
      duration: 200,
      totalSamples: 8820000,
      blocksProcessed: 2000,
      blocksSurvivingGate: 1900
    };

    const metrics = calculateReplayGainMetrics(loudness);
    expect(metrics.trackGain).toBe(5.0); // -18 - (-23) = +5.0 dB
    expect(metrics.trackPeak).toBe(0.5);
  });

  it('supports custom target loudness levels (e.g. -23.0 LUFS for EBU R128 broadcast or -14.0 LUFS for streaming)', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -16.0,
      samplePeak: 0.8,
      samplePeakDb: -1.94,
      truePeak: null,
      duration: 120,
      totalSamples: 5292000,
      blocksProcessed: 1200,
      blocksSurvivingGate: 1200
    };

    // EBU R128 target (-23.0 LUFS)
    const ebuMetrics = calculateReplayGainMetrics(loudness, { targetLufs: -23.0 });
    expect(ebuMetrics.targetLufs).toBe(-23.0);
    expect(ebuMetrics.trackGain).toBe(-7.0); // -23 - (-16) = -7.0 dB

    // Streaming target (-14.0 LUFS)
    const streamingMetrics = calculateReplayGainMetrics(loudness, { targetLufs: -14.0 });
    expect(streamingMetrics.targetLufs).toBe(-14.0);
    expect(streamingMetrics.trackGain).toBe(2.0); // -14 - (-16) = +2.0 dB
  });

  it('handles silent audio (-Infinity LUFS) safely with 0.0 dB gain', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -Infinity,
      samplePeak: 0.0,
      samplePeakDb: -Infinity,
      truePeak: null,
      duration: 10,
      totalSamples: 441000,
      blocksProcessed: 100,
      blocksSurvivingGate: 0
    };

    const metrics = calculateReplayGainMetrics(loudness);
    expect(metrics.trackGain).toBe(0.0);
    expect(metrics.trackPeak).toBe(0.0);
  });
});
