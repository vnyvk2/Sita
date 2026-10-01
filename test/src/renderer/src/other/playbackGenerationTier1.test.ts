// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Tier-1 regression tests: unified playbackGeneration + native fade ownership +
// fallback-mid-fade + destroy. Deferred promises / manual events only, no sleeps.
// Covers acceptance gates 1-8 (stale completion, fade ownership, exactly-once,
// fallback-mid-fade, post-fallback stale event, destroy race, recovery,
// repeated teardown).

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
  return {
    gain: new MockAudioParam(v),
    connect: vi.fn(),
    disconnect: vi.fn()
  };
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
  return {
    songId: id,
    title: `Song ${id}`,
    duration: 200,
    path,
    artists: [],
    replayGain: {}
  };
}

function makeQueueManager() {
  const queue = {
    on: vi.fn().mockReturnValue(() => {}),
    currentSongId: 1,
    hasNext: true,
    hasPrevious: false,
    length: 5,
    position: 0,
    songIds: [1, 2, 3, 4, 5],
    moveToNext: vi.fn(function (this: any) {
      queue.position += 1;
      queue.currentSongId = queue.songIds[queue.position] ?? null;
    }),
    moveToPrevious: vi.fn(),
    moveToPosition: vi.fn(),
    moveToStart: vi.fn(),
    isEmpty: false
  };
  return {
    getActiveQueue: () => queue,
    on: vi.fn().mockReturnValue(() => {}),
    _queue: queue
  };
}

describe('Tier-1 playbackGeneration regression tests', () => {
  let player: AudioPlayer;
  let mockQM: any;

  beforeEach(() => {
    mockQM = makeQueueManager();
    (globalThis as any).window.api = {
      audioLibraryControls: { getSong: vi.fn() },
      audioEngine: { send: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) }
    };
    player = new AudioPlayer(mockQM);
    player.audioA.load = vi.fn() as any;
    player.audioB.load = vi.fn() as any;
    player.audioA.play = vi.fn().mockResolvedValue(undefined) as any;
    player.audioB.play = vi.fn().mockResolvedValue(undefined) as any;
    player.audioA.pause = vi.fn() as any;
    player.audioB.pause = vi.fn() as any;
    Object.defineProperty(player.audioA, 'readyState', { value: 0, configurable: true });
    Object.defineProperty(player.audioB, 'readyState', { value: 0, configurable: true });
  });

  afterEach(() => {
    try {
      player.destroy();
    } catch {}
    vi.clearAllMocks();
  });

  it('Gate 1: stale getSong completion cannot mutate src/store after a newer load', async () => {
    let resolveFirst!: (v: any) => void;
    const firstGate = new Promise((r) => {
      resolveFirst = r;
    });
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockImplementation((id: number) => {
      if (id === 1) return firstGate;
      return Promise.resolve(makeSong(2, 'nora://music/song_2.flac'));
    });

    const p1 = (player as any).loadSong(1, { autoPlay: true, updateStore: true });
    const p2 = (player as any).loadSong(2, { autoPlay: true, updateStore: true });
    await p2;
    expect(player.audio.src).toContain('song_2.flac');

    resolveFirst(makeSong(1, 'nora://music/song_1.flac'));
    const r1 = await p1;
    expect(r1).toBeNull();
    expect(player.audio.src).toContain('song_2.flac');
  });

  it('Gate 6: destroy followed by deferred resolution leaves player clean with no resurrection', async () => {
    let resolveSong!: (v: any) => void;
    const gate = new Promise((r) => {
      resolveSong = r;
    });
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockImplementation(() => gate);
    const playSpyA = player.audioA.play as any;
    const playSpyB = player.audioB.play as any;

    const p = (player as any).loadSong(7, { autoPlay: true, updateStore: true });
    player.destroy();
    resolveSong(makeSong(7, 'nora://music/song_7.flac'));
    const r = await p;
    expect(r).toBeNull();
    expect(playSpyA).not.toHaveBeenCalled();
    expect(playSpyB).not.toHaveBeenCalled();
  });

  it('Gate 8: repeated destroy/fallback teardown is harmless', async () => {
    (player as any).currentSongData = makeSong(9, 'nora://music/song_9.flac');
    expect(() => {
      player.destroy();
      player.destroy();
      (player as any).fallbackToWebAudio();
      (player as any).fallbackToWebAudio();
    }).not.toThrow();
  });

  it('Gate 7: next Play/Next still works after a stale race', async () => {
    let resolveFirst!: (v: any) => void;
    const firstGate = new Promise((r) => {
      resolveFirst = r;
    });
    const getSong = (window.api as any).audioLibraryControls.getSong as any;
    getSong.mockImplementation((id: number) => {
      if (id === 1) return firstGate;
      return Promise.resolve(makeSong(id, `nora://music/song_${id}.flac`));
    });
    const p1 = (player as any).loadSong(1, { autoPlay: true, updateStore: true });
    const p2 = (player as any).loadSong(2, { autoPlay: true, updateStore: true });
    await p2;
    resolveFirst(makeSong(1, 'nora://music/song_1.flac'));
    await p1;
    const p3 = await (player as any).loadSong(3, { autoPlay: false, updateStore: true });
    expect(p3?.songId).toBe(3);
  });

  it('Gate 2+3: native fade owns FADING before await and commits exactly once', async () => {
    // Enable native path with deferred crossfade.
    let resolveXfade!: () => void;
    const xfadeGate = new Promise<void>((r) => {
      resolveXfade = r;
    });
    const backend = {
      load: vi.fn().mockResolvedValue({}),
      preload: vi.fn().mockResolvedValue({}),
      play: vi.fn().mockResolvedValue({}),
      pause: vi.fn().mockResolvedValue({}),
      seek: vi.fn().mockResolvedValue({}),
      crossfade: vi.fn().mockImplementation(() => xfadeGate),
      setVolume: vi.fn().mockResolvedValue({}),
      setEqualizer: vi.fn().mockResolvedValue({}),
      setDsp: vi.fn().mockResolvedValue({}),
      getState: vi.fn(),
      setSoundProfile: vi.fn().mockResolvedValue({}),
      destroy: vi.fn()
    };
    (player as any).nativeBackend = backend;
    (player as any).isNativeEngineActive = true;
    (player as any).preloadedSongData = makeSong(2, 'nora://music/song_2.flac');
    (player as any).currentSongData = makeSong(1, 'nora://music/song_1.flac');
    const scheduler = (player as any).crossfadeScheduler;
    // Simulate scheduler having entered FADING with session S.
    scheduler.state = 'FADING';
    const sessionId = scheduler.getSessionId();
    const delegate = (player as any).createCrossfadeDelegate
      ? null
      : null;
    void delegate;
    // Call the delegate startFade captured via fresh scheduler wiring:
    // easiest is to invoke the internal delegate through onTimeUpdate path is
    // heavy; instead directly exercise startFade logic via the scheduler's
    // delegate reference.
    const startFade = (scheduler as any).delegate?.startFade ?? (player as any).startFade;
    void startFade;
    // Fallback: drive the real delegate by reaching into the closure is not
    // accessible; so assert the contract at the player level: ownership flag
    // must be set synchronously when a native fade begins. We begin one via
    // the public crossfade entry point below.
    const fadePromise = (async () => {
      // Manually invoke the delegate stored on the scheduler.
      const d = (scheduler as any).delegate;
      return d.startFade({
        sessionId,
        incomingTrackId: 2,
        clampedFadeDuration: 0.05,
        fadeOutCurve: new Float32Array([1, 0]),
        fadeInCurve: new Float32Array([0, 1])
      });
    })();
    // Ownership BEFORE await: isCrossfading must already be true while the
    // daemon call is still pending.
    expect((player as any).isCrossfading).toBe(true);
    resolveXfade();
    await fadePromise;
    expect((player as any).currentSongData?.songId).toBe(2);
    expect((player as any).preloadedSongData).toBeNull();
  });

  it('Gate 4+5: fallback during native fade invalidates first; stale completion mutates nothing', async () => {    let resolveXfade!: () => void;
    const xfadeGate = new Promise<void>((r) => {
      resolveXfade = r;
    });
    const backend = {
      load: vi.fn().mockResolvedValue({}),
      preload: vi.fn().mockResolvedValue({}),
      play: vi.fn().mockResolvedValue({}),
      pause: vi.fn().mockResolvedValue({}),
      seek: vi.fn().mockResolvedValue({}),
      crossfade: vi.fn().mockImplementation(() => xfadeGate),
      setVolume: vi.fn().mockResolvedValue({}),
      setEqualizer: vi.fn().mockResolvedValue({}),
      setDsp: vi.fn().mockResolvedValue({}),
      getState: vi.fn(),
      setSoundProfile: vi.fn().mockResolvedValue({}),
      destroy: vi.fn()
    };
    (player as any).nativeBackend = backend;
    (player as any).isNativeEngineActive = true;
    (player as any).preloadedSongData = makeSong(2, 'nora://music/song_2.flac');
    (player as any).currentSongData = makeSong(1, 'nora://music/song_1.flac');
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    const sessionId = scheduler.getSessionId();
    const d = (scheduler as any).delegate;
    const fadePromise = d.startFade({
      sessionId,
      incomingTrackId: 2,
      clampedFadeDuration: 0.05,
      fadeOutCurve: new Float32Array([1, 0]),
      fadeInCurve: new Float32Array([0, 1])
    });
    expect((player as any).isCrossfading).toBe(true);
    // Fallback mid-fade: must invalidate first and clear logical fade state.
    (player as any).fallbackToWebAudio();
    expect((player as any).isNativeEngineActive).toBe(false);
    expect((player as any).isCrossfading).toBe(false);
    expect((player as any).preloadedSongData).toBeNull();
    resolveXfade();
    await fadePromise;
    // Stale native commit must not have run.
    expect((player as any).currentSongData?.songId).toBe(1);
    expect((player as any).preloadedSongData).toBeNull();
  });

  it('Teardown: direct destroy during native fade freezes native audio and blocks resurrection', async () => {
    let resolveXfade!: () => void;
    const xfadeGate = new Promise<void>((r) => {
      resolveXfade = r;
    });
    const backend = {
      load: vi.fn().mockResolvedValue({}),
      preload: vi.fn().mockResolvedValue({}),
      play: vi.fn().mockResolvedValue({}),
      pause: vi.fn().mockResolvedValue({}),
      seek: vi.fn().mockResolvedValue({}),
      crossfade: vi.fn().mockImplementation(() => xfadeGate),
      setVolume: vi.fn().mockResolvedValue({}),
      setEqualizer: vi.fn().mockResolvedValue({}),
      setDsp: vi.fn().mockResolvedValue({}),
      getState: vi.fn(),
      setSoundProfile: vi.fn().mockResolvedValue({}),
      destroy: vi.fn()
    };
    (player as any).nativeBackend = backend;
    (player as any).isNativeEngineActive = true;
    (player as any).preloadedSongData = makeSong(2, 'nora://music/song_2.flac');
    (player as any).currentSongData = makeSong(1, 'nora://music/song_1.flac');
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    const sessionId = scheduler.getSessionId();
    const d = (scheduler as any).delegate;
    const fadePromise = d.startFade({
      sessionId,
      incomingTrackId: 2,
      clampedFadeDuration: 0.05,
      fadeOutCurve: new Float32Array([1, 0]),
      fadeInCurve: new Float32Array([0, 1])
    });
    expect((player as any).isCrossfading).toBe(true);
    // Direct destroy mid-fade: must freeze native output AND invalidate state.
    // backend.destroy() alone does not stop the shared daemon (by design), so
    // destroy() must issue the freeze explicitly; generation handles staleness.
    player.destroy();
    expect(backend.pause).toHaveBeenCalledTimes(1);
    expect((player as any).isCrossfading).toBe(false);
    expect((player as any).preloadedSongData).toBeNull();
    resolveXfade();
    await fadePromise;
    // Stale fade commit blocked; no resurrection of slot/song/queue work.
    expect((player as any).currentSongData?.songId).toBe(1);
    expect((player as any).preloadedSongData).toBeNull();
  });
});
