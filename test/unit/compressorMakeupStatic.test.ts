import { describe, expect, it } from 'vitest';

/**
 * Phase 0A (static half) — locks the spec-derived baseline number in CI.
 * W3C Web Audio §1.19.4: makeup = (1 / curve(1.0)) ^ 0.6.
 * At threshold -6 dB, knee 0, ratio 20: curve(0 dBFS) = -5.7 dB.
 * makeup = (1 / 10^(-5.7/20)) ^ 0.6 ≈ +3.42 dB.
 * The Chromium-behavior half (real OfflineAudioContext run) is
 * scripts/measure-compressor-isolation.mjs — runnable in renderer console.
 */
describe('compressor makeup static baseline (Nora -6/20/knee-0)', () => {
  it('derives +3.42 dB makeup, -2.28 dB net peak, -16.58 dBFS quiet lift', () => {
    const outDb = -6 + (0 - -6) / 20; // -5.7
    const lin = 10 ** (outDb / 20);
    const makeupLin = (1 / lin) ** 0.6;
    const makeupDb = 20 * Math.log10(makeupLin);

    expect(outDb).toBeCloseTo(-5.7, 5);
    expect(makeupDb).toBeCloseTo(3.42, 2);
    expect(outDb + makeupDb).toBeCloseTo(-2.28, 2); // 0 dBFS in → net
    expect(-20 + makeupDb).toBeCloseTo(-16.58, 2); // -20 dBFS in → net
  });
});
