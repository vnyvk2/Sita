export interface ReplayGainCalculationParams {
  mode?: 'track' | 'album' | 'off';
  preampDb?: number;
  preventClipping?: boolean;
  trackGain?: number | null;
  trackPeak?: number | null;
  albumGain?: number | null;
  albumPeak?: number | null;
}

export interface ReplayGainCalculationResult {
  targetLinearGain: number;
  appliedGainDb: number;
  isClipped: boolean;
}

/**
 * Computes the effective linear multiplier for Web Audio ReplayGain application.
 *
 * Implements:
 * 1. Mode fallback hierarchy:
 *    - 'album' mode: uses albumGain; falls back to trackGain if albumGain is null/undefined.
 *    - 'track' mode: uses trackGain.
 *    - 'off' mode: resolves to 1.0 (0 dB).
 * 2. Deterministic default: if both albumGain and trackGain are unavailable or unanalyzed,
 *    strictly resolves to 1.0 (0 dB).
 * 3. Preamp application: applied in decibels prior to linear conversion (totalDb = baseDb + preampDb).
 * 4. Robust peak clipping prevention (Constraint #8):
 *    - Prevents post-gain discrete sample peak from exceeding 1.0: linearGain <= 1.0 / peak.
 *    - For peak < 1.0 (e.g. 0.5), permits safe headroom up to +6 dB (1.0 / 0.5 = 2.0).
 *    - For peak > 1.0 (e.g. 1.25), forces attenuation (1.0 / 1.25 = 0.8).
 *    - Robust against null, undefined, <= 0, NaN, and Infinity (defaults safePeak = 1.0).
 */
export function computeEffectiveReplayGain(
  params: ReplayGainCalculationParams
): ReplayGainCalculationResult {
  const mode = params.mode ?? 'track';
  const preampDb = Number.isFinite(params.preampDb) ? (params.preampDb as number) : 0;
  const preventClipping = params.preventClipping ?? true;

  if (mode === 'off') {
    return { targetLinearGain: 1.0, appliedGainDb: 0, isClipped: false };
  }

  // 1. Determine base gain (dB) and corresponding discrete peak according to fallback hierarchy
  let baseGainDb: number | null = null;
  let relevantPeak: number | null = null;

  if (mode === 'album') {
    if (typeof params.albumGain === 'number' && Number.isFinite(params.albumGain)) {
      baseGainDb = params.albumGain;
      relevantPeak = params.albumPeak ?? null;
    } else if (typeof params.trackGain === 'number' && Number.isFinite(params.trackGain)) {
      baseGainDb = params.trackGain;
      relevantPeak = params.trackPeak ?? null;
    }
  } else if (mode === 'track') {
    if (typeof params.trackGain === 'number' && Number.isFinite(params.trackGain)) {
      baseGainDb = params.trackGain;
      relevantPeak = params.trackPeak ?? null;
    }
  }

  // Constraint #9: If both album and track gain are unavailable, resolve strictly to 0 dB (linear 1.0)
  if (baseGainDb === null) {
    return { targetLinearGain: 1.0, appliedGainDb: 0, isClipped: false };
  }

  // 2. Add pre-amp
  const totalGainDb = baseGainDb + preampDb;
  let linearGain = Math.pow(10, totalGainDb / 20);

  // 3. Robust peak clipping prevention (Constraint #8)
  let isClipped = false;
  if (preventClipping) {
    const rawPeak = relevantPeak;
    const isPeakValid = typeof rawPeak === 'number' && Number.isFinite(rawPeak) && rawPeak > 0;
    const safePeak = isPeakValid ? rawPeak : 1.0;
    const maxSafeLinearGain = 1.0 / safePeak;

    if (linearGain > maxSafeLinearGain) {
      linearGain = maxSafeLinearGain;
      isClipped = true;
    }
  }

  return {
    targetLinearGain: Math.max(0, linearGain),
    appliedGainDb: totalGainDb,
    isClipped
  };
}
