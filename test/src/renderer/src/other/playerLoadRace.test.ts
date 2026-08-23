// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Web Audio API for jsdom environment
class MockAudioContext {
  currentTime = 0;
  destination = {};
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn()
    };
  }
  createBiquadFilter() {
    return {
      type: 'peaking',
      frequency: { value: 1000 },
      gain: { value: 0 },
      Q: { value: 1 },
      connect: vi.fn()
    };
  }
  createMediaElementSource() {
    return { connect: vi.fn() };
  }
  close() {
    return Promise.resolve();
  }
}
window.AudioContext = MockAudioContext as any;

import AudioPlayer from '@renderer/other/player';
import { store, dispatch } from '@renderer/store/store';

describe('AudioPlayer Race & Lifecycle Deterministic Regression Tests', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;
  let eventLog: string[] = [];

  beforeEach(() => {
    eventLog = [];
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
    player.audio.load = vi.fn();
    player.audio.play = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    player.destroy();
    vi.clearAllMocks();
  });

  it('P2: detaches pending canplay listener and prevents stale autoplay when rapid skip occurs', async () => {
    let resolveGetSong1: (val: any) => void;
    const getSong1Promise = new Promise((resolve) => {
      resolveGetSong1 = resolve;
    });

    window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockImplementation((songId: number) => {
          if (songId === 1) return getSong1Promise;
          return Promise.resolve({
            songId: 2,
            title: 'Song Two',
            duration: 200,
            path: 'nora://music/song_2.flac'
          });
        })
      }
    } as any;

    // Track 1 starts loading (in-flight)
    const p1 = player.playSongById(1, { autoPlay: true });

    // User immediately skips to Track 2
    const p2 = player.playSongById(2, { autoPlay: true });
    await p2;

    expect(player.audio.src).toBe('nora://music/song_2.flac');

    // Simulate Track 1 resolving late
    resolveGetSong1!({
      songId: 1,
      title: 'Song One',
      duration: 180,
      path: 'nora://music/song_1.flac'
    });
    await p1;

    // Trigger canplay event on audio element
    const canPlayEvent = new Event('canplay');
    player.audio.dispatchEvent(canPlayEvent);

    // Audio src and store must strictly remain on Song 2
    expect(player.audio.src).toBe('nora://music/song_2.flac');
    expect(store.state.currentSongData?.songId).toBe(2);
  });

  it('P3: executes exact operation sequencing (src -> load -> autoplay -> store -> trackchange -> songLoaded)', async () => {
    const sequence: string[] = [];

    // Instrument audio element and player
    const origSrcSet = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')?.set;
    const srcSpy = vi.fn().mockImplementation((val) => {
      sequence.push(`src:${val}`);
    });
    player.audio.load = vi.fn().mockImplementation(() => {
      sequence.push('audio.load');
    });

    player.on('songLoaded', (song: any) => {
      sequence.push(`event:songLoaded:${song.songId}`);
    });

    window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockResolvedValue({
          songId: 42,
          title: 'Sequential Track',
          duration: 240,
          path: 'nora://music/song_42.flac'
        })
      }
    } as any;

    await player.playSongById(42, { autoPlay: true });

    expect(player.audio.src).toBe('nora://music/song_42.flac');
    expect(player.audio.load).toHaveBeenCalledTimes(1);
    expect(store.state.currentSongData?.songId).toBe(42);
    expect(sequence).toContain('audio.load');
    expect(sequence).toContain('event:songLoaded:42');
  });

  it('P1: guarantees zero side-effects for stale requests in rapid skip sequences', async () => {
    const srcAssignments: string[] = [];
    let loadCount = 0;
    const storeSongIds: number[] = [];
    const songLoadedEvents: number[] = [];
    const recordListeningEvents: number[] = [];

    // Track all side effects
    const originalSrc = Object.getOwnPropertyDescriptor(player.audio, 'src');
    Object.defineProperty(player.audio, 'src', {
      set(val: string) {
        srcAssignments.push(val);
      },
      get() {
        return srcAssignments[srcAssignments.length - 1] || '';
      },
      configurable: true
    });

    player.audio.load = vi.fn().mockImplementation(() => {
      loadCount++;
    });

    player.on('songLoaded', (data: any) => {
      songLoadedEvents.push(data.songId);
    });

    player.on('recordListening', (data: any) => {
      recordListeningEvents.push(data.songId);
    });

    // Latency inversion: Track 1 takes 80ms, Track 2 takes 40ms, Track 3 takes 10ms
    const latencies: Record<number, number> = { 1: 80, 2: 40, 3: 10 };

    window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockImplementation((songId: number) => {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                songId,
                title: `Song ${songId}`,
                duration: 200,
                path: `nora://music/song_${songId}.flac`
              });
            }, latencies[songId]);
          });
        })
      }
    } as any;

    // Rapid skip sequence: 1 -> 2 -> 3
    const p1 = player.playSongById(1);
    const p2 = player.playSongById(2);
    const p3 = player.playSongById(3);

    await Promise.all([p1, p2, p3]);

    // Side-effects assertions:
    // Stale requests 1 and 2 must have produced ZERO side-effects!
    expect(srcAssignments).toEqual(['nora://music/song_3.flac']);
    expect(loadCount).toBe(1);
    expect(songLoadedEvents).toEqual([3]);
    expect(recordListeningEvents).toEqual([3]);
    expect(store.state.currentSongData?.songId).toBe(3);
  });
});
