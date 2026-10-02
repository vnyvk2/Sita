// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  VocalNuanceNode,
  OptionBShaper,
  VOCAL_NUANCE_MAKEUP_DB,
  VOCAL_NUANCE_PARAMS,
  dBToLinear
} from '../../src/renderer/src/other/audioFx/vocalNuanceNode';

class MockAudioParam {
  value: number;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn((val: number) => {
    this.value = val;
  });
  setTargetAtTime = vi.fn((val: number) => {
    this.value = val;
  });

  constructor(initial: number) {
    this.value = initial;
  }
}

class MockGainNode {
  gain = new MockAudioParam(1);
  channelCount = 2;
  channelCountMode = 'max';
  channelInterpretation = 'speakers';
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockDynamicsCompressorNode {
  threshold = new MockAudioParam(-12);
  knee = new MockAudioParam(12);
  ratio = new MockAudioParam(1.25);
  attack = new MockAudioParam(0.015);
  release = new MockAudioParam(0.25);
  reduction = 0;
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  currentTime = 10.0;
  createGain() {
    return new MockGainNode() as unknown as GainNode;
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode() as unknown as DynamicsCompressorNode;
  }
}

describe('VocalNuanceNode - Web Audio Parity Implementation', () => {
  let ctx: AudioContext;
  let node: VocalNuanceNode;

  beforeEach(() => {
    ctx = new MockAudioContext() as unknown as AudioContext;
    node = new VocalNuanceNode(ctx);
  });

  it('initializes with locked production parameters and calibrated makeup gain', () => {
    expect(VOCAL_NUANCE_MAKEUP_DB).toBe(1.5);
    expect(node.compressor.threshold.value).toBe(VOCAL_NUANCE_PARAMS.threshold); // -12 dBFS
    expect(node.compressor.knee.value).toBe(VOCAL_NUANCE_PARAMS.knee); // 12 dB
    expect(node.compressor.ratio.value).toBe(VOCAL_NUANCE_PARAMS.ratio); // 1.25 : 1
    expect(node.compressor.attack.value).toBe(VOCAL_NUANCE_PARAMS.attack); // 15 ms
    expect(node.compressor.release.value).toBe(VOCAL_NUANCE_PARAMS.release); // 250 ms

    const expectedLinearMakeup = dBToLinear(1.5);
    expect(node.makeupGain.gain.value).toBeCloseTo(expectedLinearMakeup, 4);
    expect(expectedLinearMakeup).toBeCloseTo(1.1885, 4);
  });

  it('starts in StudioReference profile with bit-transparent dry bypass (dry=1, wet=0)', () => {
    expect(node.isEnabled()).toBe(false);
    expect(node.getProfile()).toBe('studio_reference');
    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);
  });

  it('engages VocalNuanceBoost with wet lane active (dry=0, wet=1)', () => {
    node.setEnabled(true, true);

    expect(node.isEnabled()).toBe(true);
    expect(node.getProfile()).toBe('vocal_nuance_boost');
    expect(node.dryGain.gain.value).toBe(0);
    expect(node.wetGain.gain.value).toBe(1);
  });

  it('crossfades smoothly using 30ms time constant on dynamic toggle', () => {
    node.setProfile('vocal_nuance_boost', false);

    expect(node.dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.03);
    expect(node.wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 10.0, 0.03);

    node.setProfile('studio_reference', false);
    expect(node.dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 10.0, 0.03);
    expect(node.wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.03);
  });

  it('reports live gain reduction correctly from compressor', () => {
    expect(node.getReduction()).toBe(0);
    (node.compressor as any).reduction = -2.4;
    expect(node.getReduction()).toBe(-2.4);
  });

  it('disconnects all internal nodes upon destroy()', () => {
    node.destroy();
    expect(node.input.disconnect).toHaveBeenCalled();
    expect(node.dryGain.disconnect).toHaveBeenCalled();
    expect(node.compressor.disconnect).toHaveBeenCalled();
    expect(node.makeupGain.disconnect).toHaveBeenCalled();
    expect(node.wetGain.disconnect).toHaveBeenCalled();
    expect(node.output.disconnect).toHaveBeenCalled();
  });

  describe('OptionBShaper - Exact Upward Nuance DSP Transfer Function', () => {
    it('applies locked +1.5 dB lift to quiet signals (-30 dBFS)', () => {
      const shaper = new OptionBShaper(48000);
      const ampQuiet = Math.pow(10, -30.0 / 20.0);
      const frames = 48000; // 1s
      let lastGain = 1.0;

      for (let i = 0; i < frames; i++) {
        const t = i / 48000;
        const s = ampQuiet * Math.sin(2 * Math.PI * 1000 * t);
        shaper.processFrame(s, s, 1.0);
        lastGain = shaper.nuanceGain;
      }

      const gainDb = 20 * Math.log10(lastGain);
      expect(gainDb).toBeGreaterThanOrEqual(1.45);
      expect(gainDb).toBeLessThanOrEqual(1.55);
    });

    it('preserves loud material at exact unity gain (0.0 dB / 1.000000) for signals >= -12 dBFS', () => {
      const shaper = new OptionBShaper(48000);
      const ampHot = Math.pow(10, -3.0 / 20.0); // -3 dBFS tone (loud passage)
      const frames = 48000; // 1s
      let lastGain = 1.0;

      for (let i = 0; i < frames; i++) {
        const t = i / 48000;
        const s = ampHot * Math.sin(2 * Math.PI * 1000 * t);
        shaper.processFrame(s, s, 1.0);
        lastGain = shaper.nuanceGain;
      }

      const gainDb = 20 * Math.log10(lastGain);
      // Product Invariant: Loud passages MUST remain at unity (0.0 dB), never downward compressed!
      expect(Math.abs(gainDb)).toBeLessThan(0.01);
      expect(lastGain).toBeCloseTo(1.0, 3);
    });

    it('interpolates smoothly along C^1 cubic Hermite spline at -18 dBFS mid-level', () => {
      const shaper = new OptionBShaper(48000);
      const ampMid = Math.pow(10, -18.0 / 20.0); // Exact midpoint of [-24, -12] dBFS
      // Steady DC flat input at exact -18 dBFS midpoint (2s to allow 250ms release to settle)
      const frames = 96000;
      let lastGain = 1.0;
      for (let i = 0; i < frames; i++) {
        shaper.processFrame(ampMid, ampMid, 1.0);
        lastGain = shaper.nuanceGain;
      }

      // Hermite spline at midpoint u=0.5: s(0.5) = 0.5 -> target lift = 1.5 * 0.5 = +0.750 dB
      const gainDb = 20 * Math.log10(lastGain);
      expect(gainDb).toBeCloseTo(0.75, 2);
    });
  });
});
