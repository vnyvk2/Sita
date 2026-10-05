// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-6: fallback latches the persisted native flag (no silent re-init flap);
// explicit re-init bumps generation and reconciles inherited daemon state.

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
import { dispatch } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';

function makeSong(id: number) {
  return { songId: id, title: `Song ${id}`, duration: 200, path: `nora://music/song_${id}.flac`, artists: [], replayGain: {} };
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

describe('T2-6 fallback latch and re-init hygiene', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).requestAnimationFrame = () => 1;
    (globalThis as any).cancelAnimationFrame = () => {};
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: {
        send: vi.fn().mockResolvedValue({ status: 'ok', data: {} }),
        stop: vi.fn().mockResolvedValue(true),
        onEvent: vi.fn().mockReturnValue(() => {})
      },
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

  it('fallback persists useNative=false so later store ticks cannot silently re-init', async () => {
    // Simulate an active native engine with a current song.
    (player as any).nativeBackend = {
      destroy: vi.fn(),
      pause: vi.fn().mockResolvedValue(undefined),
      setVolume: vi.fn().mockResolvedValue(undefined),
      setDsp: vi.fn().mockResolvedValue(undefined),
      setEqualizer: vi.fn().mockResolvedValue(undefined),
      setSoundProfile: vi.fn().mockResolvedValue({})
    };
    (player as any).isNativeEngineActive = true;
    (player as any).currentSongData = makeSong(1);
    storage.playback.setPlaybackOptions('useNativeAudioEngine', true);
    (player as any).fallbackToWebAudio();
    expect(storage.playback.getPlaybackOptions('useNativeAudioEngine')).toBe(false);
    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeBackend).toBeNull();
    // An unrelated store tick must not resurrect native (flap loop).
    dispatch({ type: 'UPDATE_VOLUME_VALUE', data: 60 } as any);
    await Promise.resolve();
    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).nativeBackend).toBeNull();
  });

  it('explicit re-enable bumps generation and freezes inherited daemon state', async () => {
    (player as any).currentSongData = makeSong(1);
    const genBefore = (player as any).playbackGeneration;
    const send = (window.api as any).audioEngine.send as any;
    // Daemon reports a non-stopped state with an in-flight fade elsewhere.
    send.mockImplementation((cmd: any) => {
      if (cmd?.cmd === 'get_state') {
        return Promise.resolve({ status: 'ok', data: { state: 'playing', active_slot: 'a', volume: 1, backend: 'cpal', xrun_count: 0, low_water_mark: 0 } });
      }
      return Promise.resolve({ status: 'ok', data: {} });
    });
    storage.playback.setPlaybackOptions('useNativeAudioEngine', true);
    // Trigger the subscriber via a store tick.
    dispatch({ type: 'UPDATE_VOLUME_VALUE', data: 60 } as any);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect((player as any).isNativeEngineActive).toBe(true);
    expect((player as any).playbackGeneration).toBeGreaterThan(genBefore);
    const cmds = send.mock.calls.map((c: any[]) => c[0]?.cmd);
    expect(cmds).toContain('stop');
  });
});
