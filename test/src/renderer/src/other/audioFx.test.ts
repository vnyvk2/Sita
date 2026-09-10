// @vitest-environment jsdom
/// <reference types="vitest/globals" />

class MockAudioContext {
  currentTime = 0;
  destination = {};
  state = 'running';

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn((val: number) => {
          this.value = val;
        }),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        cancelAndHoldAtTime: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: {
        value: 1000,
        setTargetAtTime: vi.fn()
      },
      gain: {
        value: 0,
        setTargetAtTime: vi.fn()
      },
      Q: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createConvolver() {
    return {
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createDynamicsCompressor() {
    return {
      threshold: { value: -6 },
      ratio: { value: 20 },
      knee: { value: 0 },
      attack: { value: 0.003 },
      release: { value: 0.15 },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length))
    };
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

window.AudioContext = MockAudioContext as any;

import AudioPlayer from '@renderer/other/player';
import { AUDIO_FX_PRESETS } from '@renderer/other/audioFx/types';

describe('AudioPlayer Audio FX & Dual Source Graph', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;

  beforeEach(() => {
    mockQueuesManager = {
      getActiveQueue: () => ({
        on: vi.fn().mockReturnValue(() => {}),
        currentSongId: 1,
        hasNext: true,
        hasPrevious: false,
        length: 5,
        position: 0,
        moveToNext: vi.fn(),
        moveToPrevious: vi.fn(),
        moveToPosition: vi.fn(),
        moveToStart: vi.fn(),
        isEmpty: false
      }),
      on: vi.fn().mockReturnValue(() => {})
    };

    player = new AudioPlayer(mockQueuesManager);
    player.audioA.load = vi.fn();
    player.audioB.load = vi.fn();
    player.audioA.play = vi.fn().mockResolvedValue(undefined);
    player.audioB.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    player.removeAllListeners();
    vi.clearAllMocks();
  });

  it('initializes dual sources, per-track gains, and shared nodes in constructor', () => {
    expect(player.audioA).toBeDefined();
    expect(player.audioB).toBeDefined();
    expect(player.replayGainA).toBeDefined();
    expect(player.replayGainB).toBeDefined();
    expect(player.fadeGainA).toBeDefined();
    expect(player.fadeGainB).toBeDefined();
    expect(player.dryGainNode).toBeDefined();
    expect(player.wetGainNode).toBeDefined();
    expect(player.convolverNode).toBeDefined();
    expect(player.safetyLimiterNode).toBeDefined();
    expect(player.nightcoreTrebleBoostNode).toBeDefined();

    // audio getter returns the active slot (A by default)
    expect(player.audio).toBe(player.audioA);
    expect(player.standbyAudio).toBe(player.audioB);
  });

  it('applies Slowed + Reverb preset with authentic pitch-down and gain staging', () => {
    player.setAudioFxPreset('slowed');

    const fx = player.getAudioFx();
    expect(fx.preset).toBe('slowed');
    expect(fx.playbackRate).toBe(0.85);
    expect(fx.preservesPitch).toBe(false);
    expect(fx.reverbWet).toBe(0.35);
    expect(fx.lowPassCutoff).toBe(6500);

    // Both audio elements must have playbackRate and preservesPitch synced
    expect(player.audioA.playbackRate).toBe(0.85);
    expect(player.audioB.playbackRate).toBe(0.85);
    expect((player.audioA as any).preservesPitch).toBe(false);
    expect((player.audioB as any).preservesPitch).toBe(false);

    // Convolver buffer must be assigned
    expect(player.convolverNode.buffer).toBeDefined();
  });

  it('applies Nightcore preset with 1.28x rate, pitch-up, and treble boost', () => {
    player.setAudioFxPreset('nightcore');

    const fx = player.getAudioFx();
    expect(fx.preset).toBe('nightcore');
    expect(fx.playbackRate).toBe(1.28);
    expect(fx.preservesPitch).toBe(false);
    expect(fx.trebleBoostGain).toBe(2.5);
    expect(fx.reverbWet).toBe(0.0);

    expect(player.audioA.playbackRate).toBe(1.28);
    expect(player.audioB.playbackRate).toBe(1.28);
    expect((player.audioA as any).preservesPitch).toBe(false);
  });

  it('switches back to Normal preset cleanly with zero reverb wet gain', () => {
    // First enable slowed
    player.setAudioFxPreset('slowed');
    // Then reset to normal
    player.setAudioFxPreset('normal');

    const fx = player.getAudioFx();
    expect(fx.preset).toBe('normal');
    expect(fx.playbackRate).toBe(1.0);
    expect(fx.preservesPitch).toBe(true);
    expect(fx.reverbWet).toBe(0.0);

    expect(player.audioA.playbackRate).toBe(1.0);
    expect((player.audioA as any).preservesPitch).toBe(true);
  });

  it('emits audioFxChange event when preset is modified', () => {
    const fxListener = vi.fn();
    player.on('audioFxChange', fxListener);

    player.setAudioFxPreset('slowed');
    expect(fxListener).toHaveBeenCalledWith(expect.objectContaining({ preset: 'slowed' }));
  });
});
