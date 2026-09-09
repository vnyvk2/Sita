/// <reference types="vitest/globals" />
import {
  generateEqualPowerFadeInCurve,
  generateEqualPowerFadeOutCurve,
  calculateEffectiveTriggerTime
} from '../crossfadeCurves';

describe('crossfadeCurves', () => {
  describe('generateEqualPowerFadeOutCurve', () => {
    it('should generate 32 samples by default starting at 1.0 and ending at 0.0', () => {
      const curve = generateEqualPowerFadeOutCurve();
      expect(curve.length).toBe(32);
      expect(curve[0]).toBeCloseTo(1.0, 4);
      expect(curve[curve.length - 1]).toBeCloseTo(0.0, 4);
    });

    it('should monotonically decrease', () => {
      const curve = generateEqualPowerFadeOutCurve();
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeLessThanOrEqual(curve[i - 1]);
      }
    });
  });

  describe('generateEqualPowerFadeInCurve', () => {
    it('should generate 32 samples by default starting at 0.0 and ending at 1.0', () => {
      const curve = generateEqualPowerFadeInCurve();
      expect(curve.length).toBe(32);
      expect(curve[0]).toBeCloseTo(0.0, 4);
      expect(curve[curve.length - 1]).toBeCloseTo(1.0, 4);
    });

    it('should monotonically increase', () => {
      const curve = generateEqualPowerFadeInCurve();
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
    });
  });

  describe('Equal-Power Conservation (cos^2 + sin^2 = 1)', () => {
    it('should maintain acoustic power sum equal to 1.0 at every sample', () => {
      const fadeOut = generateEqualPowerFadeOutCurve(32);
      const fadeIn = generateEqualPowerFadeInCurve(32);

      for (let i = 0; i < 32; i++) {
        const power = fadeOut[i] * fadeOut[i] + fadeIn[i] * fadeIn[i];
        expect(power).toBeCloseTo(1.0, 4);
      }
    });
  });

  describe('calculateEffectiveTriggerTime', () => {
    it('should return canCrossfade: false when requested duration is 0', () => {
      const result = calculateEffectiveTriggerTime(200, 0, 1.0);
      expect(result.canCrossfade).toBe(false);
      expect(result.triggerTime).toBe(200);
    });

    it('should calculate correct trigger time at normal speed (1.0x)', () => {
      // 200s track, 5s crossfade -> fade starts at 195s, preload at 190s
      const result = calculateEffectiveTriggerTime(200, 5, 1.0, 5.0);
      expect(result.canCrossfade).toBe(true);
      expect(result.clampedFadeDuration).toBe(5);
      expect(result.triggerTime).toBe(195);
      expect(result.preloadTime).toBe(190);
    });

    it('should scale trigger time for slowed speed (0.8x)', () => {
      // 200s track, 5s real fade * 0.8 playbackRate = 4 media seconds
      // triggerTime = 200 - 4 = 196 media seconds
      const result = calculateEffectiveTriggerTime(200, 5, 0.8, 5.0);
      expect(result.canCrossfade).toBe(true);
      expect(result.clampedFadeDuration).toBe(5);
      expect(result.triggerTime).toBeCloseTo(196, 4);
      // Preload lead = 5 real seconds * 0.8 = 4 media seconds -> 192s
      expect(result.preloadTime).toBeCloseTo(192, 4);
    });

    it('should clamp fade duration to 50% for short tracks', () => {
      // 6s track, requested 5s fade -> clamped to 3s
      const result = calculateEffectiveTriggerTime(6, 5, 1.0, 2.0);
      expect(result.canCrossfade).toBe(true);
      expect(result.clampedFadeDuration).toBe(3);
      expect(result.triggerTime).toBe(3);
    });

    it('should disable crossfade if clamped duration < 0.5s', () => {
      // 0.8s track, 50% is 0.4s (< 0.5s) -> disabled
      const result = calculateEffectiveTriggerTime(0.8, 5, 1.0);
      expect(result.canCrossfade).toBe(false);
    });
  });
});
