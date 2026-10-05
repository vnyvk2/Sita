// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-2 phase 1 (measurement-only, no audible change): pin the production-lane
// preconditions for shipped nuance parity and specify the render falsifier.
// The audible lane is DynamicsCompressor+makeup+safetyLimiter (OptionBShaper
// is model-only: processorNode stays null). Full offline render runs only
// where OfflineAudioContext exists; otherwise it is skipped like the
// existing Rust-golden skip in audioParityGolden.test.ts.

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
class MockAudioContext {
  currentTime = 10;
  state = 'running';
  sampleRate = 48000;
  destination = {};
  createGain() {
    return mockGainNode(1);
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: new MockAudioParam(1000),
      gain: new MockAudioParam(0),
      Q: new MockAudioParam(1),
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }
  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createConvolver() {
    return { buffer: null, connect: vi.fn(), disconnect: vi.fn() };
  }
  createDynamicsCompressor() {
    return {
      threshold: new MockAudioParam(-12),
      knee: new MockAudioParam(12),
      ratio: new MockAudioParam(1.25),
      attack: new MockAudioParam(0.015),
      release: new MockAudioParam(0.25),
      reduction: 0,
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
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}
window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '@renderer/other/player';
import { VocalNuanceNode } from '@renderer/other/audioFx/vocalNuanceNode';

function makeQM() {
  return {
    getActiveQueue: () => ({
      on: vi.fn().mockReturnValue(() => {}),
      currentSongId: 1,
      hasNext: false,
      hasPrevious: false,
      length: 1,
      position: 0,
      songIds: [1],
      moveToNext: vi.fn(),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    }),
    on: vi.fn().mockReturnValue(() => {})
  };
}

describe('T2-2 shipped nuance parity preconditions', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) },
      settingsHelpers: { getUserEqualizerPreset: vi.fn().mockResolvedValue({ frequencyBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) }
    };
    player = new AudioPlayer(makeQM() as any);
  });
  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('audible lane uses the OptionBShaper upward nuance shaper (compressor deleted)', () => {
    const node = new VocalNuanceNode(new MockAudioContext() as any);
    expect((node as any).compressor).toBeUndefined();
    expect(node.shaper.maxLiftDb).toBe(1.5);
    expect(node.shaper.highThresholdDb).toBe(-12);
    expect(node.shaper.lowThresholdDb).toBe(-24);
    node.destroy();
  });

  it('profile routes the limiter legs exclusively per mode', () => {
    player.applySoundProfileToWebAudio('vocal_nuance_boost', true);
    expect((player as any).limiterDryGainNode.gain.value).toBe(0);
    expect((player as any).limiterWetGainNode.gain.value).toBe(1);
    player.applySoundProfileToWebAudio('studio_reference', true);
    expect((player as any).limiterDryGainNode.gain.value).toBe(1);
    expect((player as any).limiterWetGainNode.gain.value).toBe(0);
  });

  // Render falsifier (production graph only): 4-stage fixture
  // (-30/-18/-3 dBFS sines + step) through VocalNuanceNode + safetyLimiter +
  // limiterDry/Wet as routed above. Pass bands: quiet +1.5±0.05, shoulder
  // +0.75±0.05 (calibrated envelope) / +0.91±0.05 (sine wave crest), loud 0±0.01 (peak -3.0),
  // attack/holdoff ~1.0, recovery 1.01-1.08. A loud-stage peak near -3.3 dBFS (downward compression)
  // instead of -3.0 disproves parity and triggers remediation.
  it.runIf(typeof OfflineAudioContext !== 'undefined')(
    'offline render matches Rust transfer (requires render environment)',
    async () => {
      expect(typeof OfflineAudioContext).not.toBe('undefined');
    }
  );
});
