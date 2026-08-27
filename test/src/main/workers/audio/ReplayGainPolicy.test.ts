import { describe, expect, it } from 'vitest';
import { calculateReplayGainMetrics } from '../../../../../src/main/workers/process/audio/ReplayGainPolicy';
import type { LoudnessResult } from '../../../../../src/main/workers/process/audio/BS1770LoudnessEngine';

describe('Gate D2: ReplayGainPolicy (Decoupled Gain Policy)', () => {
  it('calculates trackGain relative to standard -18.0 LUFS target', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -14.0, // 4 dB louder than target
      samplePeak: 0.95,
      samplePeakDb: -0.45,
      truePeak: null,
      duration: 180,
      totalSamples: 7938000,
      blocksProcessed: 1800,
      blocksGated: 1750
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
      blocksGated: 1900
    };

    const metrics = calculateReplayGainMetrics(loudness);
    expect(metrics.trackGain).toBe(5.0); // -18 - (-23) = +5.0 dB
    expect(metrics.trackPeak).toBe(0.5);
  });

  it('supports customized target loudness levels (e.g. -14.0 LUFS for modern streaming)', () => {
    const loudness: LoudnessResult = {
      integratedLoudness: -16.0,
      samplePeak: 0.8,
      samplePeakDb: -1.94,
      truePeak: null,
      duration: 120,
      totalSamples: 5292000,
      blocksProcessed: 1200,
      blocksGated: 1200
    };

    const metrics = calculateReplayGainMetrics(loudness, { targetLufs: -14.0 });
    expect(metrics.targetLufs).toBe(-14.0);
    expect(metrics.trackGain).toBe(2.0); // -14 - (-16) = +2.0 dB
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
      blocksGated: 0
    };

    const metrics = calculateReplayGainMetrics(loudness);
    expect(metrics.trackGain).toBe(0.0);
    expect(metrics.trackPeak).toBe(0.0);
  });
});
