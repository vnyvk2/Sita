// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Gate 5 lifecycle: enable-before-ready must record intent without silencing
// output. The wet lane has no input until the worklet (or fallback) attaches,
// so setEnabled() before settlement must hold dry=1/wet=0 and apply on attach.

class MockAudioParam {
  value: number;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  cancelScheduledValues = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setValueCurveAtTime = vi.fn();
  cancelAndHoldAtTime = vi.fn();
  constructor(v: number) {
    this.value = v;
  }
}
function mockGainNode(v = 1) {
  return { gain: new MockAudioParam(v), connect: vi.fn(), disconnect: vi.fn() };
}

let resolveAddModule!: (v: boolean) => void;
let addModuleGate: Promise<boolean>;

class MockAudioContext {
  currentTime = 10;
  state = 'running';
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: vi.fn(() => addModuleGate) };
  createGain() {
    return mockGainNode(1);
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: new MockAudioParam(1000),
      gain: new MockAudioParam(0),
      Q: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }
  createChannelSplitter() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createChannelMerger() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}
window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

class MockAudioWorkletNode {
  connect = vi.fn();
  disconnect = vi.fn();
  constructor(
    public ctx: unknown,
    public name: string,
    public opts?: unknown
  ) {}
}

import { VocalNuanceNode } from '@renderer/other/audioFx/vocalNuanceNode';

describe('VocalNuanceNode enable-before-ready lifecycle', () => {
  let prevWorkletNode: unknown;

  beforeEach(() => {
    prevWorkletNode = (globalThis as any).AudioWorkletNode;
    (globalThis as any).AudioWorkletNode = MockAudioWorkletNode;
    addModuleGate = new Promise<boolean>((r) => {
      resolveAddModule = r;
    });
  });

  afterEach(() => {
    if (prevWorkletNode === undefined) {
      delete (globalThis as any).AudioWorkletNode;
    } else {
      (globalThis as any).AudioWorkletNode = prevWorkletNode;
    }
    vi.clearAllMocks();
  });

  it('holds dry output (no silence) when enabled before worklet attach, then crossfades on attach', async () => {
    const ctx = new MockAudioContext() as unknown as AudioContext;
    const node = new VocalNuanceNode(ctx);
    node.setEnabled(true);

    // Intent recorded, but gains held: output must not go silent.
    expect(node.isEnabled()).toBe(true);
    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);

    resolveAddModule(true);
    await node.ready;

    // Wet path activates via crossfade only after attach.
    expect(node.dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.03);
    expect(node.wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 10.0, 0.03);
    node.destroy();
  });

  it('saved-boost boot enable (immediate) holds dry until attach, then snaps wet', async () => {
    const ctx = new MockAudioContext() as unknown as AudioContext;
    const node = new VocalNuanceNode(ctx);
    // Cold-start restore path: enable immediately, worklet still loading.
    node.setEnabled(true, true);

    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);

    resolveAddModule(true);
    await node.ready;

    expect(node.dryGain.gain.value).toBe(0);
    expect(node.wetGain.gain.value).toBe(1);
    node.destroy();
  });

  it('on-then-off before attach never activates the wet lane', async () => {
    const ctx = new MockAudioContext() as unknown as AudioContext;
    const node = new VocalNuanceNode(ctx);
    node.setEnabled(true);
    node.setEnabled(false);

    resolveAddModule(true);
    await node.ready;

    expect(node.dryGain.gain.value).toBe(1);
    expect(node.wetGain.gain.value).toBe(0);
    expect(node.wetGain.gain.setTargetAtTime).not.toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.anything()
    );
    node.destroy();
  });
});
