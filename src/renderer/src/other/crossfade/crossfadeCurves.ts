/**
 * Pure mathematical functions for equal-power crossfading.
 * Completely decoupled from DOM and Web Audio API for 100% testability.
 */

export const CURVE_SAMPLE_COUNT = 128;

/**
 * Generates an equal-power fade-out curve (cosine taper).
 * cos(0) = 1.0 -> cos(pi/2) = 0.0
 */
export function generateEqualPowerFadeOutCurve(steps: number = CURVE_SAMPLE_COUNT): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const progress = i / (steps - 1);
    curve[i] = Math.cos(progress * (Math.PI / 2));
  }
  return curve;
}

/**
 * Generates an equal-power fade-in curve (sine taper).
 * sin(0) = 0.0 -> sin(pi/2) = 1.0
 */
export function generateEqualPowerFadeInCurve(steps: number = CURVE_SAMPLE_COUNT): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const progress = i / (steps - 1);
    curve[i] = Math.sin(progress * (Math.PI / 2));
  }
  return curve;
}

export interface CrossfadeTriggerCalculation {
  canCrossfade: boolean;
  clampedFadeDuration: number;
  triggerTime: number;
  preloadTime: number;
}

/**
 * Calculates effective trigger time considering playbackRate and duration limits.
 *
 * @param duration - Current track duration in media seconds
 * @param requestedFadeDuration - User configured crossfade duration in real-time seconds (0-12s)
 * @param playbackRate - Current playback rate (e.g. 0.8 for slowed, 1.25 for nightcore)
 * @param preloadLeadTime - Preload lead time in real-time seconds before fade starts (default 5s)
 */
export function calculateEffectiveTriggerTime(
  duration: number,
  requestedFadeDuration: number,
  playbackRate: number = 1.0,
  preloadLeadTime: number = 5.0
): CrossfadeTriggerCalculation {
  if (requestedFadeDuration <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return {
      canCrossfade: false,
      clampedFadeDuration: 0,
      triggerTime: duration,
      preloadTime: duration
    };
  }

  const effectiveRate = Math.max(0.1, Math.min(4.0, playbackRate));

  // Max crossfade duration is 50% of track length to prevent overwhelming short songs
  const clampedFadeDuration = Math.min(requestedFadeDuration, duration * 0.5);

  // If clamped duration is too short (< 0.5s), don't crossfade
  if (clampedFadeDuration < 0.5) {
    return {
      canCrossfade: false,
      clampedFadeDuration: 0,
      triggerTime: duration,
      preloadTime: duration
    };
  }

  // Media seconds consumed by the fade
  const mediaFadeDuration = clampedFadeDuration * effectiveRate;
  const triggerTime = Math.max(0, duration - mediaFadeDuration);

  // Preload lead time in media seconds
  const mediaPreloadLead = preloadLeadTime * effectiveRate;
  const preloadTime = Math.max(0, triggerTime - mediaPreloadLead);

  return {
    canCrossfade: true,
    clampedFadeDuration,
    triggerTime,
    preloadTime
  };
}
