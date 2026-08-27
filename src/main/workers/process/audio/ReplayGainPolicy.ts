import type { LoudnessResult } from './BS1770LoudnessEngine';

export interface ReplayGainOptions {
  /**
   * Target loudness level in LUFS (default is -18.0 LUFS for Nora / ReplayGain 2.0 policy).
   * Note: EBU R128 broadcast standard uses -23.0 LUFS.
   */
  targetLufs?: number;
}

export interface ReplayGainMetrics {
  /** Recommended gain adjustment in dB relative to target (trackGain = targetLufs - integratedLoudness) */
  trackGain: number;
  /** Peak discrete sample amplitude [0.0, 1.0+] */
  trackPeak: number;
  /** Target loudness reference level applied */
  targetLufs: number;
  /** Measured BS.1770 integrated loudness in LUFS */
  integratedLoudness: number;
  /** Measured discrete sample peak in dBFS */
  samplePeakDb: number;
}

/**
 * Pure policy conversion from BS.1770 LoudnessResult to Nora ReplayGain metrics.
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
