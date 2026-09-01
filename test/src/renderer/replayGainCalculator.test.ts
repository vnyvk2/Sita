import { describe, expect, it } from 'vitest';

import { computeEffectiveReplayGain } from '../../../src/renderer/src/other/replayGainCalculator';

describe('Gate D3: computeEffectiveReplayGain (Robust Limiter & Mode Fallback)', () => {
  it('resolves to 0 dB (multiplier 1.0) when mode is off', () => {
    const result = computeEffectiveReplayGain({
      mode: 'off',
      trackGain: -5.0,
      preampDb: 3.0
    });
    expect(result.targetLinearGain).toBe(1.0);
    expect(result.appliedGainDb).toBe(0);
    expect(result.isClipped).toBe(false);
  });

  it('resolves deterministically to 0 dB when both album and track gains are unavailable (Constraint #9)', () => {
    const result = computeEffectiveReplayGain({
      mode: 'album',
      albumGain: null,
      trackGain: null,
      preampDb: 2.0
    });
    expect(result.targetLinearGain).toBe(1.0);
    expect(result.appliedGainDb).toBe(0);
    expect(result.isClipped).toBe(false);
  });

  it('uses trackGain in track mode with preamp applied', () => {
    // trackGain = -6.0206 dB (~0.5 linear multiplier), preamp = 0
    const result = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: -6.0206,
      trackPeak: 0.8,
      preventClipping: false
    });
    expect(result.targetLinearGain).toBeCloseTo(0.5, 3);
    expect(result.appliedGainDb).toBeCloseTo(-6.0206, 4);
    expect(result.isClipped).toBe(false);
  });

  it('prefers albumGain in album mode, but falls back to trackGain when albumGain is missing', () => {
    // Both available: uses albumGain (-3 dB)
    const withAlbum = computeEffectiveReplayGain({
      mode: 'album',
      albumGain: -3.0,
      trackGain: -6.0,
      preventClipping: false
    });
    expect(withAlbum.appliedGainDb).toBe(-3.0);

    // Album missing: falls back to trackGain (-6 dB)
    const fallback = computeEffectiveReplayGain({
      mode: 'album',
      albumGain: null,
      trackGain: -6.0,
      preventClipping: false
    });
    expect(fallback.appliedGainDb).toBe(-6.0);
  });

  it('robust clipping limiter prevents sample clipping for peaks < 1.0 (allows headroom)', () => {
    // Track peak = 0.5. Max safe gain is 1.0 / 0.5 = 2.0 (+6.02 dB).
    // Requested gain is +3 dB (linear ~1.414). Should NOT be clipped!
    const unclipped = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 3.0,
      trackPeak: 0.5,
      preventClipping: true
    });
    expect(unclipped.targetLinearGain).toBeCloseTo(1.414, 2);
    expect(unclipped.isClipped).toBe(false);

    // Requested gain is +12 dB (linear ~3.98). Should be clamped to 2.0!
    const clamped = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 12.0,
      trackPeak: 0.5,
      preventClipping: true
    });
    expect(clamped.targetLinearGain).toBeCloseTo(2.0, 4);
    expect(clamped.isClipped).toBe(true);
  });

  it('robust clipping limiter attenuates signals with peak > 1.0', () => {
    // Track peak = 1.25. Max safe gain is 1.0 / 1.25 = 0.8 (-1.94 dB).
    // Requested gain is 0 dB (linear 1.0). Must be attenuated to 0.8!
    const result = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 0.0,
      trackPeak: 1.25,
      preventClipping: true
    });
    expect(result.targetLinearGain).toBeCloseTo(0.8, 4);
    expect(result.isClipped).toBe(true);
  });

  it('handles null, NaN, zero, and Infinity peaks safely without producing NaN or Infinity (Constraint #8)', () => {
    // Peak is null
    const nullPeak = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 6.0, // linear ~2.0
      trackPeak: null,
      preventClipping: true
    });
    // Falls back to safePeak 1.0 -> clamped to 1.0
    expect(nullPeak.targetLinearGain).toBeCloseTo(1.0, 4);
    expect(nullPeak.isClipped).toBe(true);

    // Peak is NaN
    const nanPeak = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 6.0,
      trackPeak: NaN,
      preventClipping: true
    });
    expect(nanPeak.targetLinearGain).toBeCloseTo(1.0, 4);
    expect(nanPeak.isClipped).toBe(true);

    // Peak is 0
    const zeroPeak = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 6.0,
      trackPeak: 0,
      preventClipping: true
    });
    expect(zeroPeak.targetLinearGain).toBeCloseTo(1.0, 4);
    expect(zeroPeak.isClipped).toBe(true);

    // Peak is Infinity
    const infPeak = computeEffectiveReplayGain({
      mode: 'track',
      trackGain: 6.0,
      trackPeak: Infinity,
      preventClipping: true
    });
    expect(infPeak.targetLinearGain).toBeCloseTo(1.0, 4);
    expect(infPeak.isClipped).toBe(true);
  });
});
