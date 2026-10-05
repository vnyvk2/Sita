// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
        cancelScheduledValues: vi.fn()
      },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: { value: 1000, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      gain: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      Q: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn()
    };
  }

  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
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
      threshold: { value: -6, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      knee: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      ratio: { value: 20, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      attack: { value: 0.003, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      release: { value: 0.15, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
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

  close() {
    return Promise.resolve();
  }
}

window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '@renderer/other/player';

describe('Gate C: Native Audio to WebAudio Fallback Scenarios', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;
  let playSpy: any;

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

    (globalThis as any).window.api = {
      audioEngine: {
        send: vi.fn().mockResolvedValue({ id: 1, status: 'ok' }),
        stop: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn().mockReturnValue(() => {})
      }
    };

    player = new AudioPlayer(mockQueuesManager);
    player.audio.load = vi.fn();
    playSpy = vi.spyOn(player, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    player?.destroy();
    vi.clearAllMocks();
  });

  it('Scenario 1: native playing -> fallback -> Web playing', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = true;
    (player as any).currentSongData = { songId: 101, path: 'nora://songs/track101.flac' };
    player.volume = 0.6;

    // Trigger fallback
    (player as any).fallbackToWebAudio();

    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeIsPlaying).toBe(false);
    expect((player as any).audio.src).toContain('track101.flac');
    expect(playSpy).toHaveBeenCalledTimes(1);

    // Verify single-authority volume invariant post-fallback
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(0.6);
  });

  it('Scenario 2: native paused -> fallback -> Web paused', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = false;
    (player as any).currentSongData = { songId: 102, path: 'nora://songs/track102.mp3' };
    player.volume = 0.8;

    (player as any).fallbackToWebAudio();

    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeIsPlaying).toBe(false);
    expect((player as any).audio.src).toContain('track102.mp3');
    expect(playSpy).not.toHaveBeenCalled();
    expect(player.paused).toBe(true);

    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.gainNode.gain.value).toBe(0.8);
  });

  it('Scenario 3: native stopped -> fallback -> Web stopped', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = false;
    (player as any).currentSongData = null;

    (player as any).fallbackToWebAudio();

    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeIsPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
    expect(player.paused).toBe(true);

    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
  });

  it('Scenario 4: native paused at non-zero position -> fallback -> same position + paused', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = false;
    (player as any).nativeCurrentPosition = 84.25;
    (player as any).currentSongData = { songId: 104, path: 'nora://songs/track104.wav' };

    (player as any).fallbackToWebAudio();

    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeIsPlaying).toBe(false);
    expect((player as any).audio.src).toContain('track104.wav');
    expect(player.audio.currentTime).toBe(84.25);
    expect(playSpy).not.toHaveBeenCalled();
    expect(player.paused).toBe(true);

    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
  });

  it('Scenario 5: fallback with studio_reference profile configures WebAudio bypass and dry limiter', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = false;
    (player as any).currentSongData = { songId: 105, path: 'nora://songs/track105.flac' };

    player.setSoundProfile('studio_reference', true);
    (player as any).fallbackToWebAudio();

    expect(player.getSoundProfile()).toBe('studio_reference');
    expect(player.vocalNuanceNode.isEnabled()).toBe(false);
    expect(player.limiterDryGainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 0);
    expect(player.limiterWetGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, 0);
  });

  it('Scenario 6: fallback with vocal_nuance_boost profile activates WebAudio nuance node and wet limiter', () => {
    (player as any).isNativeEngineActive = true;
    (player as any).nativeIsPlaying = false;
    (player as any).currentSongData = { songId: 106, path: 'nora://songs/track106.flac' };

    player.setSoundProfile('vocal_nuance_boost', true);
    (player as any).fallbackToWebAudio();

    expect(player.getSoundProfile()).toBe('vocal_nuance_boost');
    expect(player.vocalNuanceNode.isEnabled()).toBe(true);
    expect(player.limiterDryGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.0, 0);
    expect(player.limiterWetGainNode.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 0);
  });
});
