// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// T2-3: canplay autoplay wait — bounded timeout, split error outcome, all under
// generation + loadRequestId guards. Deferred promises + fake timers, no sleeps.

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
  currentTime = 0;
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
      Q: { value: 1 },
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

function makeSong(id: number, path: string) {
  return { songId: id, title: `Song ${id}`, duration: 200, path, artists: [], replayGain: {} };
}
function makeQueueManager() {
  return {
    getActiveQueue: () => ({
      on: vi.fn().mockReturnValue(() => {}),
      currentSongId: 1,
      hasNext: true,
      hasPrevious: false,
      length: 5,
      position: 0,
      songIds: [1, 2],
      moveToNext: vi.fn(),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    }),
    on: vi.fn().mockReturnValue(() => {})
  };
}

describe('T2-3 canplay timeout/error guards', () => {
  let player: AudioPlayer;
  beforeEach(() => {
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }
    };
    player = new AudioPlayer(makeQueueManager() as any);
    player.audioA.load = vi.fn() as any;
    player.audioB.load = vi.fn() as any;
    player.audioA.play = vi.fn().mockResolvedValue(undefined) as any;
    player.audioB.play = vi.fn().mockResolvedValue(undefined) as any;
    Object.defineProperty(player.audioA, 'readyState', { value: 0, configurable: true });
    Object.defineProperty(player.audioB, 'readyState', { value: 0, configurable: true });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('error before canplay never autoplays and reports loadError for the current load', async () => {
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockResolvedValue(makeSong(1, 'nora://music/song_1.flac'));
    const loadErrors: any[] = [];
    player.on('loadError', (d: any) => loadErrors.push(d));
    const p = (player as any).loadSong(1, { autoPlay: true, updateStore: false });
    await p;
    // Fire error on the pending element.
    const el = (player as any).pendingCanPlayHandler ? player.audio : player.audio;
    el.dispatchEvent(new Event('error'));
    expect(player.audio.play).not.toHaveBeenCalled();
    expect(loadErrors.length).toBe(1);
    expect(loadErrors[0].songId).toBe(1);
    expect((player as any).pendingCanPlayHandler).toBeNull();
  });

  it('stalled media times out, clears the wait, and reports once', async () => {
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockResolvedValue(makeSong(2, 'nora://music/song_2.flac'));
    const loadErrors: any[] = [];
    player.on('loadError', (d: any) => loadErrors.push(d));
    const p = (player as any).loadSong(2, { autoPlay: true, updateStore: false });
    await p;
    expect((player as any).pendingCanPlayHandler).not.toBeNull();
    await vi.advanceTimersByTimeAsync(8000);
    expect((player as any).pendingCanPlayHandler).toBeNull();
    expect(loadErrors.length).toBe(1);
    expect(loadErrors[0].songId).toBe(2);
    expect(player.audio.play).not.toHaveBeenCalled();
  });

  it('obsolete load timeout/error is silent against the newer song', async () => {
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockImplementation((id: number) =>
      Promise.resolve(makeSong(id, `nora://music/song_${id}.flac`))
    );
    const loadErrors: any[] = [];
    player.on('loadError', (d: any) => loadErrors.push(d));
    const p1 = (player as any).loadSong(1, { autoPlay: true, updateStore: false });
    await p1;
    const p2 = (player as any).loadSong(2, { autoPlay: true, updateStore: false });
    await p2;
    // Stale wait from load 1 was detached at load 2 start; advancing past its
    // 8s window must not report loadError for song 1 nor autoplay it.
    await vi.advanceTimersByTimeAsync(9000);
    expect(loadErrors.filter((e) => e.songId === 1).length).toBe(0);
  });
});
