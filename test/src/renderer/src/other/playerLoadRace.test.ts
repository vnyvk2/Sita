import { beforeEach, describe, expect, test, vi } from 'vitest';

// Setup DOM mocks for AudioContext, Audio, etc.
class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  };
  connect = vi.fn();
}

class MockBiquadFilterNode {
  type = 'peaking';
  frequency = { value: 1000 };
  Q = { value: 1 };
  gain = { value: 0 };
  connect = vi.fn();
}

class MockMediaElementAudioSourceNode {
  connect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  createGain = vi.fn(() => new MockGainNode());
  createBiquadFilter = vi.fn(() => new MockBiquadFilterNode());
  createMediaElementSource = vi.fn(() => new MockMediaElementAudioSourceNode());
  close = vi.fn();
}

class MockAudioElement {
  src = '';
  crossOrigin = '';
  preload = 'auto';
  defaultPlaybackRate = 1.0;
  playbackRate = 1.0;
  volume = 1.0;
  muted = false;
  currentTime = 0;
  duration = 180;
  readyState = 0;
  paused = true;

  private listeners: Map<string, Set<EventListener>> = new Map();

  addEventListener(event: string, handler: EventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: EventListener) {
    this.listeners.get(event)?.delete(handler);
  }

  dispatchEvent(event: Event) {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
    return true;
  }

  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  // Helper for test to simulate canplay
  triggerCanPlay() {
    this.readyState = 4;
    this.dispatchEvent(new Event('canplay'));
  }
}

// Attach globals before imports
// @ts-expect-error Mocking window
global.window = global.window || {};
// @ts-expect-error Mocking window AudioContext
global.window.AudioContext = MockAudioContext;
// @ts-expect-error Mocking window Audio
global.Audio = MockAudioElement;

const mockGetSong = vi.fn();
// @ts-expect-error Mocking window.api
global.window.api = {
  audioLibraryControls: {
    getSong: mockGetSong
  },
  settings: {
    getUserSettings: vi.fn().mockResolvedValue({ language: 'en' })
  }
};

vi.mock('@renderer/i18n', () => ({
  default: {
    t: (k: string) => k
  }
}));

vi.mock('@renderer/other/equalizerData', () => ({
  equalizerBandHertzData: {
    '32': 32,
    '64': 64,
    '125': 125,
    '250': 250,
    '500': 500,
    '1k': 1000,
    '2k': 2000,
    '4k': 4000,
    '8k': 8000,
    '16k': 16000
  }
}));

const mockDispatch = vi.fn();
vi.mock('@renderer/store/store', () => ({
  dispatch: (...args: unknown[]) => mockDispatch(...args),
  store: {
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    state: {
      player: {
        volume: { value: 100, isMuted: false },
        playbackRate: 1.0,
        isRepeating: 'none'
      },
      currentSongData: undefined
    }
  }
}));

vi.mock('@renderer/utils/localStorage', () => ({
  default: {
    playback: {
      setCurrentSongOptions: vi.fn()
    },
    queue: {
      getQueue: vi.fn(() => ({ queues: [], currentQueueIndex: 0 })),
      setQueue: vi.fn(),
      updateQueueData: vi.fn()
    }
  }
}));

import AudioPlayer from '@renderer/other/player';
import { QueuesManager } from '@renderer/other/queuesManager';

describe('AudioPlayer Playback Concurrency & Race Tests (Phase P2 & P3)', () => {
  let queuesManager: QueuesManager;
  let player: AudioPlayer;

  beforeEach(() => {
    vi.clearAllMocks();
    queuesManager = new QueuesManager();
    player = new AudioPlayer(queuesManager);
  });

  test('deterministic out-of-order resolution (C -> B -> A) commits ONLY the latest request C', async () => {
    const songA = {
      songId: 101,
      title: 'Song A (Slow)',
      duration: 200,
      path: 'nora://localfiles/C:/music/A.flac',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    const songB = {
      songId: 102,
      title: 'Song B (Medium)',
      duration: 180,
      path: 'nora://localfiles/C:/music/B.flac',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    const songC = {
      songId: 103,
      title: 'Song C (Fast)',
      duration: 220,
      path: 'nora://localfiles/C:/music/C.flac',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    let resolveA: (val: typeof songA) => void;
    let resolveB: (val: typeof songB) => void;
    let resolveC: (val: typeof songC) => void;

    mockGetSong.mockImplementation((id: number) => {
      if (id === 101) return new Promise((res) => { resolveA = res; });
      if (id === 102) return new Promise((res) => { resolveB = res; });
      if (id === 103) return new Promise((res) => { resolveC = res; });
      return Promise.reject(new Error('Unknown ID'));
    });

    // Fire 3 sequential load requests in order A -> B -> C
    // @ts-expect-error Access private loadSong for deterministic testing
    const promiseA = player.loadSong(101, { autoPlay: true });
    // @ts-expect-error Access private loadSong for deterministic testing
    const promiseB = player.loadSong(102, { autoPlay: true });
    // @ts-expect-error Access private loadSong for deterministic testing
    const promiseC = player.loadSong(103, { autoPlay: true });

    // 1. Resolve C first (fastest)
    resolveC!(songC);
    const resultC = await promiseC;

    expect(resultC).toEqual(songC);
    // Audio src is assigned to C and loaded without cache-busting timestamp
    expect(player.audio.src).toBe('nora://localfiles/C:/music/C.flac');
    expect(player.audio.load).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'CURRENT_SONG_DATA_CHANGE',
      data: songC
    });

    // 2. Resolve B second (stale)
    resolveB!(songB);
    const resultB = await promiseB;

    // Stale resolution must return undefined and make NO mutations
    expect(resultB).toBeUndefined();
    expect(player.audio.src).toBe('nora://localfiles/C:/music/C.flac'); // Still C!
    expect(player.audio.load).toHaveBeenCalledTimes(1); // Not called again for B
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'CURRENT_SONG_DATA_CHANGE',
      data: songB
    });

    // 3. Resolve A third (slowest, stale)
    resolveA!(songA);
    const resultA = await promiseA;

    // Stale resolution must return undefined and make NO mutations
    expect(resultA).toBeUndefined();
    expect(player.audio.src).toBe('nora://localfiles/C:/music/C.flac'); // Still C!
    expect(player.audio.load).toHaveBeenCalledTimes(1); // Not called again for A
    expect(mockDispatch).not.toHaveBeenCalledWith({
      type: 'CURRENT_SONG_DATA_CHANGE',
      data: songA
    });

    // 4. Trigger canplay - should only play C
    (player.audio as unknown as MockAudioElement).triggerCanPlay();
    expect(player.audio.play).toHaveBeenCalledTimes(1);
  });

  test('cancels previous canplay autoplay handler when a new song request arrives', async () => {
    const song1 = {
      songId: 1,
      title: 'Song 1',
      duration: 100,
      path: 'nora://localfiles/C:/music/1.mp3',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    const song2 = {
      songId: 2,
      title: 'Song 2',
      duration: 100,
      path: 'nora://localfiles/C:/music/2.mp3',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    mockGetSong.mockResolvedValueOnce(song1);
    // @ts-expect-error Access private loadSong
    await player.loadSong(1, { autoPlay: true });

    // Song 1 is loaded, canplay listener is active waiting for audio buffer
    mockGetSong.mockResolvedValueOnce(song2);
    // @ts-expect-error Access private loadSong
    await player.loadSong(2, { autoPlay: true });

    // Now trigger canplay
    (player.audio as unknown as MockAudioElement).triggerCanPlay();

    // Invariant: Play is called for the current song, not multiple times
    expect(player.audio.play).toHaveBeenCalledTimes(1);
    expect(player.audio.src).toBe('nora://localfiles/C:/music/2.mp3');
  });

  test('playSongById handles concurrent calls race-safely via loadSong delegation', async () => {
    const song1 = {
      songId: 10,
      title: 'Song 10',
      duration: 120,
      path: 'nora://localfiles/C:/music/10.mp3',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    const song2 = {
      songId: 20,
      title: 'Song 20',
      duration: 150,
      path: 'nora://localfiles/C:/music/20.mp3',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    let resolve1: (val: typeof song1) => void;
    let resolve2: (val: typeof song2) => void;

    mockGetSong.mockImplementation((id: number) => {
      if (id === 10) return new Promise((res) => { resolve1 = res; });
      if (id === 20) return new Promise((res) => { resolve2 = res; });
      return Promise.reject(new Error('Unknown'));
    });

    const p1 = player.playSongById(10);
    const p2 = player.playSongById(20);

    // Resolve song 2 first, then song 1
    resolve2!(song2);
    await p2;

    expect(player.audio.src).toBe('nora://localfiles/C:/music/20.mp3');

    resolve1!(song1);
    await p1;

    // Stale resolution of song 1 must NOT overwrite song 2
    expect(player.audio.src).toBe('nora://localfiles/C:/music/20.mp3');
  });

  test('destroy() cancels in-flight load and prevents ghost playback', async () => {
    const song = {
      songId: 99,
      title: 'Ghost Song',
      duration: 200,
      path: 'nora://localfiles/C:/music/99.mp3',
      isAFavorite: false,
      isKnownSource: true,
      isBlacklisted: false
    };

    let resolveSong: (val: typeof song) => void;
    mockGetSong.mockImplementation(() => new Promise((res) => { resolveSong = res; }));

    // Start loading song
    // @ts-expect-error Access private loadSong
    const loadPromise = player.loadSong(99, { autoPlay: true });

    // Destroy player while load is in-flight
    player.destroy();

    // Now resolve getSong
    resolveSong!(song);
    const result = await loadPromise;

    // Resolution must be discarded as stale and audio src must remain empty
    expect(result).toBeUndefined();
    expect(player.audio.src).toBe('');
    expect(player.audio.play).not.toHaveBeenCalled();
  });

  test('loadSong correctly emits loadError with initialSongId when getSong throws', async () => {
    const loadErrorListener = vi.fn();
    player.on('loadError', loadErrorListener);

    mockGetSong.mockRejectedValueOnce(new Error('Network error or file unreadable'));

    // @ts-expect-error Access private loadSong
    await expect(player.loadSong(555)).rejects.toThrow('Network error or file unreadable');

    expect(loadErrorListener).toHaveBeenCalledWith(
      expect.objectContaining({
        songId: 555,
        error: expect.any(Error)
      })
    );
  });

  test('superseded fade promise settles immediately without hanging when rapid play/pause occurs', async () => {
    const pausePromise = player.pause();
    const playPromise = player.play();

    // The superseded pausePromise must settle rather than hanging unresolved forever
    await expect(pausePromise).resolves.toBeUndefined();
    await expect(playPromise).resolves.toBeUndefined();
  });
});
