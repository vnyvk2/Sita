// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  VocalNuanceNode,
  VOCAL_NUANCE_MAKEUP_DB,
  VOCAL_NUANCE_PARAMS,
  dBToLinear
} from '../../src/renderer/src/other/audioFx/vocalNuanceNode';

class MockAudioParam {
  value: number;
  cancelScheduledValues = vi.fn();
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
});
