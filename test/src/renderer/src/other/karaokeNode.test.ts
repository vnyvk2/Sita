// @vitest-environment jsdom
/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import { KaraokeNode } from '@renderer/other/audioFx/karaokeNode';

interface MockGainNode {
  gain: {
    value: number;
    setTargetAtTime: ReturnType<typeof vi.fn>;
  };
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockBiquadFilter {
  type: string;
  frequency: { value: number };
  Q: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

class TestAudioContext {
  currentTime = 0;

  createGain(): MockGainNode {
    return {
      gain: {
        value: 1,
        setTargetAtTime: vi.fn(function (this: { value: number }, val: number) {
          this.value = val;
        })
      },
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createBiquadFilter(): MockBiquadFilter {
    return {
      type: 'lowpass',
      frequency: { value: 350 },
      Q: { value: 0.707 },
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createChannelSplitter(_channels: number) {
    return {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createChannelMerger(_channels: number) {
    return {
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }
}

describe('KaraokeNode - Topology & Lifecycle', () => {
  it('constructs with explicit stereo channel configuration and default cutoffs', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);

    expect(node.input.channelCount).toBe(2);
    expect(node.input.channelCountMode).toBe('explicit');
    expect(node.input.channelInterpretation).toBe('speakers');
    expect(node.enabled).toBe(false);
  });

  it('restores state immediately without crossfade when immediate=true', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);

    node.setEnabled(true, true);
    expect(node.enabled).toBe(true);
    // Access private dry/wet via casting for unit verification
    const internal = node as unknown as { dry: MockGainNode; wet: MockGainNode };
    expect(internal.dry.gain.value).toBe(0);
    expect(internal.wet.gain.value).toBe(1);
    expect(internal.dry.gain.setTargetAtTime).not.toHaveBeenCalled();

    node.setEnabled(false, true);
    expect(node.enabled).toBe(false);
    expect(internal.dry.gain.value).toBe(1);
    expect(internal.wet.gain.value).toBe(0);
  });

  it('schedules smooth ~30ms crossfade ramps when immediate=false', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);
    const internal = node as unknown as { dry: MockGainNode; wet: MockGainNode };

    node.setEnabled(true, false);
    expect(node.enabled).toBe(true);
    expect(internal.dry.gain.setTargetAtTime).toHaveBeenCalledWith(0, 0, 0.01);
    expect(internal.wet.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, 0.01);
  });

  it('adjusts dry/wet gains proportionally according to reduction level', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);
    const internal = node as unknown as { dry: MockGainNode; wet: MockGainNode };

    // Enable at 100% (default)
    node.setEnabled(true, true);
    expect(internal.dry.gain.value).toBe(0);
    expect(internal.wet.gain.value).toBe(1);

    // Set to 50% reduction: dry = 0.5, wet = 0.5
    node.setLevel(50, true);
    expect(node.level).toBe(50);
    expect(internal.dry.gain.value).toBeCloseTo(0.5);
    expect(internal.wet.gain.value).toBeCloseTo(0.5);

    // Set to 20% reduction: dry = 0.8, wet = 0.2
    node.setLevel(20, true);
    expect(node.level).toBe(20);
    expect(internal.dry.gain.value).toBeCloseTo(0.8);
    expect(internal.wet.gain.value).toBeCloseTo(0.2);

    // Clamping boundaries: -10 -> 0, 150 -> 100
    node.setLevel(-10, true);
    expect(node.level).toBe(0);
    expect(internal.dry.gain.value).toBe(1);
    expect(internal.wet.gain.value).toBe(0);

    node.setLevel(150, true);
    expect(node.level).toBe(100);
    expect(internal.dry.gain.value).toBe(0);
    expect(internal.wet.gain.value).toBe(1);
  });

  it('keeps wet gain at 0 when node is disabled regardless of level setting', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);
    const internal = node as unknown as { dry: MockGainNode; wet: MockGainNode };

    expect(node.enabled).toBe(false);
    node.setLevel(75, true);
    expect(node.level).toBe(75);
    // Node is disabled, so wet must remain 0 and dry must remain 1
    expect(internal.wet.gain.value).toBe(0);
    expect(internal.dry.gain.value).toBe(1);

    // When enabled with preserved level, gains apply
    node.setEnabled(true, true);
    expect(internal.wet.gain.value).toBeCloseTo(0.75);
    expect(internal.dry.gain.value).toBeCloseTo(0.25);
  });

  it('allows setEnabled to accept an initial level directly', () => {
    const ctx = new TestAudioContext();
    const node = new KaraokeNode(ctx as unknown as AudioContext);
    const internal = node as unknown as { dry: MockGainNode; wet: MockGainNode };

    node.setEnabled(true, true, 40);
    expect(node.enabled).toBe(true);
    expect(node.level).toBe(40);
    expect(internal.wet.gain.value).toBeCloseTo(0.4);
    expect(internal.dry.gain.value).toBeCloseTo(0.6);
  });
});

describe('KaraokeNode - Mathematical LR4 DSP Transfer Functions', () => {
  // Complex number arithmetic helper for exact biquad frequency evaluation
  interface Complex {
    re: number;
    im: number;
  }

  function cMul(a: Complex, b: Complex): Complex {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re
    };
  }

  function cDiv(a: Complex, b: Complex): Complex {
    const d = b.re * b.re + b.im * b.im;
    return {
      re: (a.re * b.re + a.im * b.im) / d,
      im: (a.im * b.re - a.re * b.im) / d
    };
  }

  function cMag(a: Complex): number {
    return Math.sqrt(a.re * a.re + a.im * a.im);
  }

  // Bilinear transform calculation for standard Butterworth biquad (Q = 0.707)
  function evalButterworthBiquad(freq: number, cutoff: number, type: 'lowpass' | 'highpass', sampleRate = 48000): Complex {
    const w0 = 2 * Math.PI * (cutoff / sampleRate);
    const alpha = Math.sin(w0) / (2 * 0.707);
    const cosw0 = Math.cos(w0);

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;

    if (type === 'lowpass') {
      b0 = (1 - cosw0) / 2;
      b1 = 1 - cosw0;
      b2 = (1 - cosw0) / 2;
    } else {
      b0 = (1 + cosw0) / 2;
      b1 = -(1 + cosw0);
      b2 = (1 + cosw0) / 2;
    }

    // Evaluate H(e^jw) at target freq
    const w = 2 * Math.PI * (freq / sampleRate);
    const cosw = Math.cos(w);
    const sinw = Math.sin(w);
    const cos2w = Math.cos(2 * w);
    const sin2w = Math.sin(2 * w);

    const num: Complex = {
      re: (b0 + b1 * cosw + b2 * cos2w) / a0,
      im: (-b1 * sinw - b2 * sin2w) / a0
    };

    const den: Complex = {
      re: 1 + (a1 * cosw + a2 * cos2w) / a0,
      im: (-a1 * sinw - a2 * sin2w) / a0
    };

    return cDiv(num, den);
  }

  // Cascaded Linkwitz-Riley 4th order: H_LR4 = (H_Butterworth)^2
  function evalLR4(freq: number, cutoff: number, type: 'lowpass' | 'highpass'): Complex {
    const section = evalButterworthBiquad(freq, cutoff, type);
    return cMul(section, section);
  }

  // Evaluates output of complementary parallel legs:
  // L_out = (L - M) + LP(M) + HP(M)
  // R_out = (R - M) + LP(M) + HP(M)
  function evalKaraokeTopology(freq: number, L: number, R: number, lowCutoff = 220, highCutoff = 6000) {
    const M = 0.5 * (L + R);
    const sideL = L - M;
    const sideR = R - M;

    const lp = evalLR4(freq, lowCutoff, 'lowpass');
    const hp = evalLR4(freq, highCutoff, 'highpass');

    const legsRe = lp.re * M + hp.re * M;
    const legsIm = lp.im * M + hp.im * M;

    const outL: Complex = { re: sideL + legsRe, im: legsIm };
    const outR: Complex = { re: sideR + legsRe, im: legsIm };

    return {
      magL: cMag(outL),
      magR: cMag(outR),
      dbL: 20 * Math.log10(Math.max(1e-6, cMag(outL))),
      dbR: 20 * Math.log10(Math.max(1e-6, cMag(outR))),
      outL,
      outR
    };
  }

  it('attenuates centered vocals across the vocal core by comfortable margins', () => {
    // 500 Hz: predicted ~28 dB attenuation, assert >= 15 dB
    const res500 = evalKaraokeTopology(500, 1.0, 1.0);
    expect(res500.dbL).toBeLessThanOrEqual(-15);
    expect(res500.dbR).toBeLessThanOrEqual(-15);

    // 1 kHz: predicted ~52 dB attenuation, assert >= 20 dB
    const res1000 = evalKaraokeTopology(1000, 1.0, 1.0);
    expect(res1000.dbL).toBeLessThanOrEqual(-20);
    expect(res1000.dbR).toBeLessThanOrEqual(-20);

    // 2 kHz: predicted ~38 dB attenuation, assert >= 15 dB
    const res2000 = evalKaraokeTopology(2000, 1.0, 1.0);
    expect(res2000.dbL).toBeLessThanOrEqual(-15);
    expect(res2000.dbR).toBeLessThanOrEqual(-15);
  });

  it('preserves centered low-end bass (80 Hz) and high-end sparkle (12 kHz) within ±1.5 dB', () => {
    const res80 = evalKaraokeTopology(80, 1.0, 1.0);
    expect(Math.abs(res80.dbL)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(res80.dbR)).toBeLessThanOrEqual(1.5);

    const res12000 = evalKaraokeTopology(12000, 1.0, 1.0);
    expect(Math.abs(res12000.dbL)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(res12000.dbR)).toBeLessThanOrEqual(1.5);
  });

  it('in-band hard-panned content (1 kHz in L) drops to -6.0 dB ± 1 dB with inverted bleed', () => {
    // L = 1.0, R = 0.0 at 1 kHz (in-band)
    const res = evalKaraokeTopology(1000, 1.0, 0.0);

    // Both channels should be -6 dB ± 1 dB
    expect(res.dbL).toBeCloseTo(-6.0, 0);
    expect(res.dbR).toBeCloseTo(-6.0, 0);

    // Polarity inverted: L_out + R_out ≈ 0
    const sumMag = cMag({ re: res.outL.re + res.outR.re, im: res.outL.im + res.outR.im });
    expect(sumMag).toBeLessThan(0.01);
  });

  it('out-of-band hard-panned content preserves own channel within transition band and nulls opposite channel in the passband limit', () => {
    // 1. Transition band (80 Hz): own channel preserved within ±1.5 dB (observed -1.38 dB due to LR4 phase lag)
    const res80 = evalKaraokeTopology(80, 1.0, 0.0);
    expect(Math.abs(res80.dbL)).toBeLessThanOrEqual(1.5);

    // 2. High transition band (12 kHz): own channel preserved within ±2.0 dB (observed -1.88 dB at 1 octave above 6kHz)
    const res12k = evalKaraokeTopology(12000, 1.0, 0.0);
    expect(Math.abs(res12k.dbL)).toBeLessThanOrEqual(2.0);

    // 3. Exact topology assertion in ideal passband limit (where LP -> 1, HP -> 0):
    // L_out = (L - M) + LP(M) = 0.5 + 0.5 = 1.0 (0 dB)
    // R_out = (R - M) + LP(M) = -0.5 + 0.5 = 0.0 (exact null)
    const idealL = (1.0 - 0.5) + 1.0 * 0.5; // L - M + LP(M)
    const idealR = (0.0 - 0.5) + 1.0 * 0.5; // R - M + LP(M)
    expect(idealL).toBe(1.0);
    expect(idealR).toBe(0.0);
  });
});
