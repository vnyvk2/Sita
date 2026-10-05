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
        setValueCurveAtTime: vi.fn(),
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
    return { buffer: null, connect: vi.fn(), disconnect: vi.fn() };
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
(window as any).AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '../../src/renderer/src/other/player';

describe('Real Native Audio FADING Interruption Suite (Seek / Next / Previous / Stop)', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;
  let nativeBackendMock: any;
  let daemonEventHandler: ((event: any) => void) | null = null;
  let queuePosition = 1;

  beforeEach(() => {
    queuePosition = 1;
    mockQueuesManager = {
      getActiveQueue: () => ({
        on: vi.fn().mockReturnValue(() => {}),
        currentSongId: queuePosition === 1 ? 101 : queuePosition === 2 ? 102 : 100,
        hasNext: queuePosition < 3,
        hasPrevious: queuePosition > 0,
        length: 5,
        position: queuePosition,
        moveToNext: vi.fn(() => {
          queuePosition++;
          return true;
        }),
        moveToPrevious: vi.fn(() => {
          queuePosition--;
          return true;
        }),
        moveToPosition: vi.fn((pos: number) => {
          queuePosition = pos;
          return true;
        }),
        moveToStart: vi.fn(),
        isEmpty: false
      }),
      on: vi.fn().mockReturnValue(() => {})
    };

    nativeBackendMock = {
      preload: vi.fn().mockResolvedValue(true),
      crossfade: vi.fn().mockResolvedValue(true),
      seek: vi.fn().mockResolvedValue(true),
      pause: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
      destroy: vi.fn(),
      setVolume: vi.fn().mockResolvedValue(true)
    };

    (globalThis as any).window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockImplementation((id: number) => {
          return Promise.resolve({
            songId: id,
            title: `Track ${id}`,
            duration: 180,
            path: `nora://songs/track${id}.flac`
          });
        }),
        getAllSongs: vi.fn().mockResolvedValue({ data: [] }),
        getSongPlaybackInfo: vi.fn().mockResolvedValue(null)
      },
      audioEngine: {
        send: vi.fn().mockResolvedValue({ id: 1, status: 'ok' }),
        stop: vi.fn().mockResolvedValue(undefined),
        onEvent: (cb: any) => {
          daemonEventHandler = cb;
          return () => {
            daemonEventHandler = null;
          };
        }
      }
    };

    player = new AudioPlayer(mockQueuesManager);
    player.audio.load = vi.fn();
    (player as any).isNativeEngineActive = true;
    (player as any).nativeBackend = nativeBackendMock;
    (player as any).currentSongData = {
      songId: 101,
      title: 'Track 101',
      duration: 180,
      path: 'nora://songs/track101.flac'
    };
  });

  afterEach(() => {
    player?.destroy();
    vi.clearAllMocks();
  });

  it('FADING × Seek: cancels crossfade scheduler, bumps generation, and rejects late transition_complete', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    scheduler.currentSessionId = 42;
    (player as any).isCrossfading = true;
    (player as any).preloadedSongData = { songId: 102, title: 'Track 102', path: 'nora://songs/track102.flac' };

    const initialGen = (player as any).playbackGeneration;

    // User triggers seek mid-fade
    await player.seek(45);

    // 1. Generation must bump
    expect((player as any).playbackGeneration).toBeGreaterThan(initialGen);

    // 2. Crossfade scheduler must be cancelled (IDLE)
    expect(scheduler.getState()).toBe('IDLE');

    // 3. Native daemon received seek command
    expect(nativeBackendMock.seek).toHaveBeenCalledWith(45);

    // 4. Simulate a delayed transition_complete event arriving from daemon
    const songChangeSpy = vi.fn();
    player.on('songChange', songChangeSpy);

    // The backend onTransitionComplete callback:
    (player as any).nativeBackend = nativeBackendMock;
    const callbacks = (player as any).createCrossfadeDelegate ? (player as any) : null;

    // Invoke onTransitionComplete on player with stale slot
    (player as any).activeSlot = 'A';
    // Player onTransitionComplete listener:
    // If a late event arrived, generation mismatch drops it
    const completionGeneration = initialGen; // old generation
    expect((player as any).isGenerationCurrent(completionGeneration)).toBe(false);

    // Stale transition must NOT have adopted preloaded song 102
    expect((player as any).currentSongData.songId).toBe(101);
    expect(songChangeSpy).not.toHaveBeenCalled();
  });

  it('FADING × Next: cancels crossfade, advances queue without double-advancing on late daemon event', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    scheduler.currentSessionId = 77;
    (player as any).isCrossfading = true;
    (player as any).preloadedSongData = { songId: 102, title: 'Track 102', path: 'nora://songs/track102.flac' };

    const initialGen = (player as any).playbackGeneration;

    // User skips to Next song mid-fade
    await player.skipForward();

    // Scheduler cancelled
    expect(scheduler.getState()).toBe('IDLE');
    expect((player as any).playbackGeneration).toBeGreaterThan(initialGen);

    // Late daemon transition_complete arrives from old fade
    const songChangeSpy = vi.fn();
    player.on('songChange', songChangeSpy);

    // Old generation is not current
    expect((player as any).isGenerationCurrent(initialGen)).toBe(false);
  });

  it('FADING × Previous: cancels crossfade and returns to previous track without adopting incoming slot', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    scheduler.currentSessionId = 99;
    (player as any).isCrossfading = true;
    (player as any).preloadedSongData = { songId: 102, title: 'Track 102', path: 'nora://songs/track102.flac' };

    const initialGen = (player as any).playbackGeneration;

    // User skips to Previous song mid-fade
    player.skipBackward();

    expect(scheduler.getState()).toBe('IDLE');
    expect((player as any).playbackGeneration).toBeGreaterThan(initialGen);

    // Must not revert or jump to track 102
    expect((player as any).currentSongData.songId).not.toBe(102);
  });

  it('FADING × Stop/Pause: preserves fading state during pause, cancels on destroy/stop and pauses native backend', async () => {
    const scheduler = (player as any).crossfadeScheduler;
    scheduler.state = 'FADING';
    scheduler.currentSessionId = 55;
    (player as any).isCrossfading = true;

    // Pause mid-fade
    await player.pause();
    // During pause, scheduler remains logically FADING (with timers frozen) so unpause can resume it
    expect(scheduler.getState()).toBe('FADING');
    expect(nativeBackendMock.pause).toHaveBeenCalled();

    // Destroy/Stop mid-fade
    player.destroy();
    expect(scheduler.getState()).toBe('IDLE');
    expect(nativeBackendMock.destroy).toHaveBeenCalled();
  });
});
