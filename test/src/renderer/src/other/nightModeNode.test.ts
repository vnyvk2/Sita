// @vitest-environment jsdom
/// <reference types="vitest/globals" />

import { describe, expect, it, vi } from 'vitest';
import {
  NightModeNode,
  NIGHT_MODE_PRESETS,
  dBToLinearGain
} from '@renderer/other/audioFx/nightModeNode';

interface MockAudioParam {
  value: number;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

const createMockAudioParam = (initial: number): MockAudioParam => ({
  value: initial,
  setTargetAtTime: vi.fn(function (this: { value: number }, val: number) {
    this.value = val;
  }),
  cancelScheduledValues: vi.fn()
});

interface MockGainNode {
  gain: MockAudioParam;
  channelCount: number;
  channelCountMode: string;
  channelInterpretation: string;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockCompressorNode {
  threshold: MockAudioParam;
  knee: MockAudioParam;
  ratio: MockAudioParam;
  attack: MockAudioParam;
  release: MockAudioParam;
  reduction: number;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

class TestAudioContext {
  currentTime = 0;

  createGain(): MockGainNode {
    return {
      gain: createMockAudioParam(1),
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createDynamicsCompressor(): MockCompressorNode {
    return {
      threshold: createMockAudioParam(-24),
      knee: createMockAudioParam(30),
      ratio: createMockAudioParam(12),
      attack: createMockAudioParam(0.003),
      release: createMockAudioParam(0.25),
      reduction: -4.5,
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }
}

describe('NightModeNode — Topology & Lifecycle', () => {
  it('starts disabled with a pure dry bypass (dry = 1, wet = 0)', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);

    expect(node.input.channelCount).toBe(2);
    expect(node.input.channelCountMode).toBe('explicit');
    expect(node.input.channelInterpretation).toBe('speakers');

    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);
    expect(node.isEnabled()).toBe(false);
    expect(node.getPreset()).toBe('standard');
  });

  it('snaps instantly when immediate = true (cold-start restore path)', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);

    node.setEnabled(true, true);
    expect(node.dryGain.gain.value).toBe(0);
    expect(node.wetGain.gain.value).toBe(1);
    expect(node.isEnabled()).toBe(true);
    expect(node.dryGain.gain.setTargetAtTime).not.toHaveBeenCalled();

    node.setEnabled(false, true);
    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);
    expect(node.isEnabled()).toBe(false);
  });

  it('crossfades via complementary ramps when immediate = false', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);
    const drySpy = vi.spyOn(node.dryGain.gain, 'setTargetAtTime');
    const wetSpy = vi.spyOn(node.wetGain.gain, 'setTargetAtTime');
    const cancelSpy = vi.spyOn(node.wetGain.gain, 'cancelScheduledValues');

    node.setEnabled(true);

    // Targets: dry -> 0, wet -> 1
    expect(drySpy).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number));
    expect(wetSpy).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('is idempotent — re-applying current state schedules nothing (feedback-loop guard)', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);

    node.setEnabled(true);
    const wetMock = node.wetGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>;
    wetMock.mockClear();

    node.setEnabled(true); // echoed store event — must be a no-op
    expect(wetMock).not.toHaveBeenCalled();

    node.setEnabled(false);
    const dryMock = node.dryGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>;
    dryMock.mockClear();

    node.setEnabled(false); // echoed store event — must be a no-op
    expect(dryMock).not.toHaveBeenCalled();
  });

  it.each(['gentle', 'standard', 'strong'] as const)(
    'applies the %s preset profile to the compressor',
    (preset) => {
      const ctx = new TestAudioContext();
      const node = new NightModeNode(ctx as unknown as AudioContext);
      node.setPreset(preset, true);
      const p = NIGHT_MODE_PRESETS[preset];

      expect(node.compressor.threshold.value).toBe(p.threshold);
      expect(node.compressor.knee.value).toBe(p.knee);
      expect(node.compressor.ratio.value).toBe(p.ratio);
      expect(node.compressor.attack.value).toBe(p.attack);
      expect(node.compressor.release.value).toBe(p.release);
      expect(node.makeupGain.gain.value).toBeCloseTo(dBToLinearGain(p.makeupGainDb));
      expect(node.getPreset()).toBe(preset);
    }
  );

  it('converts make-up dB to linear amplitude: A = 10^(dB/20)', () => {
    expect(dBToLinearGain(0)).toBe(1);
    expect(dBToLinearGain(3)).toBeCloseTo(1.4125, 3);
    expect(dBToLinearGain(5)).toBeCloseTo(1.7783, 3);
    expect(dBToLinearGain(7)).toBeCloseTo(2.2387, 3);
  });

  it('ramps compressor parameters when switching presets mid-signal', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);
    const thresholdSpy = vi.spyOn(node.compressor.threshold, 'setTargetAtTime');

    node.setPreset('strong');
    expect(thresholdSpy).toHaveBeenCalledWith(
      NIGHT_MODE_PRESETS.strong.threshold,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('ignores redundant preset changes (idempotency)', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);

    node.setPreset('strong', true);
    const spy = vi.spyOn(node.compressor.threshold, 'setTargetAtTime');
    node.setPreset('strong');
    expect(spy).not.toHaveBeenCalled();
  });

  it('getReduction() mirrors the compressor reduction readout', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);
    expect(node.getReduction()).toBe(node.compressor.reduction);
  });

  it('destroy() disconnects all internal nodes safely', () => {
    const ctx = new TestAudioContext();
    const node = new NightModeNode(ctx as unknown as AudioContext);
    expect(() => node.destroy()).not.toThrow();
  });
});
