// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-4: gainNode is the sole volume/mute authority; elements stay pinned
// (volume 1.0, muted false). Includes fade + fallback interaction.

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

describe('T2-4 sole volume/mute authority', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }
    };
    player = new AudioPlayer(makeQM() as any);
  });
  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('volume setter drives gainNode with elements pinned', () => {
    player.volume = 0.5;
    expect(player.gainNode.gain.value).toBe(0.5);
    expect(player.audioA.volume).toBe(1.0);
    expect(player.audioB.volume).toBe(1.0);
    expect(player.audioA.muted).toBe(false);
    expect(player.audioB.muted).toBe(false);
  });

  it('mute silences gainNode without muting elements', () => {
    player.volume = 0.5;
    player.muted = true;
    expect(player.muted).toBe(true);
    expect(player.gainNode.gain.value).toBe(0);
    expect(player.audioA.muted).toBe(false);
    expect(player.audioB.muted).toBe(false);
    player.muted = false;
    expect(player.gainNode.gain.value).toBe(0.5);
  });

  it('volume change while muted does not unmute audibly', () => {
    player.volume = 0.5;
    player.muted = true;
    player.volume = 0.8;
    expect(player.gainNode.gain.value).toBe(0);
    expect((player as any).currentVolume).toBe(80);
  });

  it('store path takes the same gainNode-only route', () => {
    (player as any).updatePlayerVolume({ value: 50, isMuted: true });
    expect(player.gainNode.gain.value).toBe(0);
    expect(player.audioA.muted).toBe(false);
    expect(player.audioB.muted).toBe(false);
    expect(player.muted).toBe(true);
  });

  it('fallback preserves mute instead of restoring audibility', () => {
    player.volume = 0.5;
    player.muted = true;
    (player as any).currentSongData = {
      songId: 1,
      title: 'Song 1',
      duration: 200,
      path: 'nora://music/song_1.flac',
      artists: [],
      replayGain: {}
    };
    (player as any).fallbackToWebAudio();
    expect(player.gainNode.gain.value).toBe(0);
  });

  it('fade-in while muted ramps to silence, not to volume', async () => {
    vi.useFakeTimers();
    player.volume = 0.5;
    player.muted = true;
    const ramp = player.gainNode.gain.exponentialRampToValueAtTime as any;
    ramp.mockClear();
    const p = (player as any).fadeInAudio();
    const done = p.then(() => {});
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(ramp).toHaveBeenCalledTimes(1);
    expect(ramp.mock.calls[0][0]).toBeCloseTo(0.001, 5);
  });

  it('fallback preserves store-driven mute across the latch dispatch', async () => {
    const { dispatch } = await import('@renderer/store/store');
    dispatch({ type: 'UPDATE_VOLUME_VALUE', data: 50 } as any);
    dispatch({ type: 'UPDATE_MUTED_STATE', data: true } as any);
    expect(player.muted).toBe(true);
    (player as any).currentSongData = {
      songId: 1,
      title: 'Song 1',
      duration: 200,
      path: 'nora://music/song_1.flac',
      artists: [],
      replayGain: {}
    };
    (player as any).fallbackToWebAudio();
    expect(player.gainNode.gain.value).toBe(0);
    expect(player.muted).toBe(true);
  });
});
