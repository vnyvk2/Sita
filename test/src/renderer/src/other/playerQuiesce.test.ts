// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockAudioParam {
  value: number;
  setValueAtTime = vi.fn();
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
      threshold: new MockAudioParam(-6),
      knee: new MockAudioParam(0),
      ratio: new MockAudioParam(20),
      attack: new MockAudioParam(0.003),
      release: new MockAudioParam(0.15),
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
import storage from '@renderer/utils/localStorage';

function makeSong(id: number) {
  return {
    songId: id,
    title: `Song ${id}`,
    duration: 200,
    path: `nora://music/song_${id}.flac`,
    artists: [],
    replayGain: {}
  };
}

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

describe('Player Web Audio Quiescence & Reverse Handoff', () => {
  let player: AudioPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = () => {};
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: {
        send: vi.fn().mockResolvedValue({ status: 'ok', data: {} }),
        stop: vi.fn().mockResolvedValue(true),
        onEvent: vi.fn().mockReturnValue(() => {})
      },
      settingsHelpers: {
        getUserEqualizerPreset: vi.fn().mockResolvedValue({ frequencyBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
      }
    };
    player = new AudioPlayer(makeQM() as any);
  });

  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('quiesces both audioA and audioB and cancels scheduler when switching to native engine mid-fade', () => {
    const p = player as any;
    p.audioA.src = 'nora://music/song_1.flac';
    p.audioB.src = 'nora://music/song_2.flac';
    p.isCrossfading = true;
    p.crossfadeScheduler.state = 'FADING';

    p.initNativeBackend();

    expect(p.audioA.getAttribute('src')).toBeNull();
    expect(p.audioB.getAttribute('src')).toBeNull();
    expect(p.audioA.paused).toBe(true);
    expect(p.audioB.paused).toBe(true);
    expect(p.crossfadeScheduler.getState()).toBe('IDLE');
  });

  it('reloads src and restores playback position on reverse handoff (native -> web)', () => {
    const p = player as any;
    p.nativeBackend = {
      destroy: vi.fn(),
      pause: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn().mockResolvedValue(undefined),
      setDsp: vi.fn().mockResolvedValue(undefined),
      setEqualizer: vi.fn().mockResolvedValue(undefined),
      setSoundProfile: vi.fn().mockResolvedValue({})
    };
    p.isNativeEngineActive = true;
    p.nativeIsPlaying = true;
    p.nativeCurrentPosition = 75.5;
    p.currentSongData = makeSong(1);

    storage.playback.setPlaybackOptions('useNativeAudioEngine', true);

    p.fallbackToWebAudio();

    expect(p.isNativeEngineActive).toBe(false);
    expect(p.audio.src).toContain('song_1.flac');
    expect(p.audio.currentTime).toBe(75.5);
    expect(storage.playback.getPlaybackOptions('useNativeAudioEngine')).toBe(false);
  });

  it('watchdog detects leaked playing element during native playback and invokes quiesceWebAudio', () => {
    const p = player as any;
    p.isNativeEngineActive = true;

    const quiesceSpy = vi.spyOn(player, 'quiesceWebAudio');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    Object.defineProperty(p.audioB, 'paused', { value: false, configurable: true, writable: true });

    vi.advanceTimersByTime(2500);

    expect(quiesceSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AudioPlayer.Watchdog] Leaked active HTMLAudioElement detected'),
      expect.anything()
    );
  });

  it('watchdog logs warning if unowned playing audio element exists in document', () => {
    const p = player as any;
    p.isNativeEngineActive = true;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const unowned = document.createElement('audio');
    Object.defineProperty(unowned, 'paused', { value: false, configurable: true });
    document.body.appendChild(unowned);

    vi.advanceTimersByTime(2500);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AudioPlayer.Watchdog] Unowned playing audio'),
      expect.anything()
    );

    document.body.removeChild(unowned);
  });
});
