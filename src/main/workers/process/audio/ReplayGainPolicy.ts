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
 * Pure policy calculation of ReplayGain adjustment (dB) from integrated loudness (LUFS).
 * Gain (dB) = Target (LUFS) - Integrated Loudness (LUFS)
 * If integrated loudness is -Infinity (e.g. silence or <400ms), returns 0.0 dB.
 */
export function calculateLoudnessGain(
  integratedLoudness: number,
  options?: ReplayGainOptions
): number {
  const targetLufs = options?.targetLufs ?? -18.0;
  if (!Number.isFinite(integratedLoudness)) {
    return 0.0;
  }
  return Math.round((targetLufs - integratedLoudness) * 100) / 100;
}

/**
 * Pure policy conversion from BS.1770 LoudnessResult to Nora ReplayGain metrics.
 */
export function calculateReplayGainMetrics(
  loudness: LoudnessResult,
  options?: ReplayGainOptions
): ReplayGainMetrics {
  const targetLufs = options?.targetLufs ?? -18.0;
  const trackGain = calculateLoudnessGain(loudness.integratedLoudness, options);

  return {
    trackGain,
    trackPeak: Math.round(loudness.samplePeak * 10000) / 10000,
    targetLufs,
    integratedLoudness: loudness.integratedLoudness,
    samplePeakDb: loudness.samplePeakDb
  };
}
