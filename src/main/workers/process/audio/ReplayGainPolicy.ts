import type { LoudnessResult } from './BS1770LoudnessEngine';

export interface ReplayGainOptions {
  /** Target loudness level in LUFS (default is -18.0 LUFS) */
  targetLufs?: number;
  /** Maximum allowable peak to avoid clipping if gain is applied (default 1.0) */
  maxTruePeakLimit?: number;
}

export interface ReplayGainMetrics {
  /** Recommended gain adjustment in dB relative to target */
  trackGain: number;
  /** Peak linear sample amplitude [0.0, 1.0+] */
  trackPeak: number;
  /** Target loudness reference level */
  targetLufs: number;
  /** Measured integrated loudness */
  integratedLoudness: number;
  /** Measured sample peak in dBFS */
  samplePeakDb: number;
}

/**
 * Pure policy conversion from BS.1770 LoudnessResult to standard ReplayGain metrics.
 */
export function calculateReplayGainMetrics(
  loudness: LoudnessResult,
  options?: ReplayGainOptions
): ReplayGainMetrics {
  const targetLufs = options?.targetLufs ?? -18.0;

  let trackGain = 0.0;
  if (Number.isFinite(loudness.integratedLoudness)) {
    // Gain (dB) = Target (LUFS) - Integrated Loudness (LUFS)
    trackGain = targetLufs - loudness.integratedLoudness;
  }

  return {
    trackGain: Math.round(trackGain * 100) / 100,
    trackPeak: Math.round(loudness.samplePeak * 10000) / 10000,
    targetLufs,
    integratedLoudness: loudness.integratedLoudness,
    samplePeakDb: loudness.samplePeakDb
  };
}
