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
    const makeParam = (val: number) => ({
      value: val,
      setValueAtTime: vi.fn(function (this: { value: number }, v: number) {
        this.value = v;
      }),
      setTargetAtTime: vi.fn(function (this: { value: number }, v: number) {
        this.value = v;
      }),
      cancelScheduledValues: vi.fn()
    });
    return {
      type: 'peaking',
      frequency: makeParam(1000),
      gain: makeParam(0),
      Q: makeParam(1),
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
    const makeParam = (val: number) => ({
      value: val,
      setTargetAtTime: vi.fn(function (this: { value: number }, v: number) {
        this.value = v;
      }),
      cancelScheduledValues: vi.fn()
    });
    return {
      threshold: makeParam(-6),
      ratio: makeParam(20),
      knee: makeParam(0),
      attack: makeParam(0.003),
      release: makeParam(0.15),
      reduction: 0,
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }

  createChannelSplitter(_channels: number) {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }

  createChannelMerger(_channels: number) {
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

import { AUDIO_FX_PRESETS } from '@renderer/other/audioFx/types';
import AudioPlayer from '@renderer/other/player';

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
    expect(player.limiterDryGainNode).toBeDefined();
    expect(player.limiterWetGainNode).toBeDefined();
    expect(player.vocalNuanceNode).toBeDefined();
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

  it('updates WebAudio routing and emits event when soundProfile is toggled', () => {
    const profileListener = vi.fn();
    player.on('soundProfileChange', profileListener);

    expect(player.getSoundProfile()).toBe('studio_reference');
    expect(player.vocalNuanceNode.isEnabled()).toBe(false);

    // Toggle to vocal nuance boost
    player.setSoundProfile('vocal_nuance_boost', true);
    expect(player.getSoundProfile()).toBe('vocal_nuance_boost');
    expect(player.vocalNuanceNode.isEnabled()).toBe(true);
    expect(profileListener).toHaveBeenCalledWith('vocal_nuance_boost');

    // Toggle back to studio reference
    player.setSoundProfile('studio_reference', true);
    expect(player.getSoundProfile()).toBe('studio_reference');
    expect(player.vocalNuanceNode.isEnabled()).toBe(false);
    expect(profileListener).toHaveBeenCalledWith('studio_reference');
  });
});
