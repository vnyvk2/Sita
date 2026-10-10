// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain() { return { gain: { value: 1, setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { type: 'peaking', frequency: { value: 1000, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, gain: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, Q: { value: 1, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createConvolver() { return { buffer: null, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: { value: -6, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, knee: { value: 0, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, ratio: { value: 20, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, attack: { value: 0.003, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, release: { value: 0.15, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() }, reduction: 0, connect: vi.fn(), disconnect: vi.fn() }; }
  createChannelSplitter() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  createChannelMerger() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
(window as any).AudioContext = MockAudioContext as unknown as typeof AudioContext;

import AudioPlayer from '../../src/renderer/src/other/player';
import storage from '../../src/renderer/src/utils/localStorage';

describe('Native Audio Crossfade Scheduler', () => {
  let player: AudioPlayer;
  let mockQueuesManager: any;
  let sendMock: any;

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

    sendMock = vi.fn().mockResolvedValue({ id: 1, status: 'ok' });

    (globalThis as any).window.api = {
      audioLibraryControls: {
        getSong: vi.fn().mockResolvedValue({
          songId: 202,
          path: 'nora://songs/track202.flac'
        })
      },
      audioEngine: {
        send: sendMock,
        stop: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn().mockReturnValue(() => {})
      }
    };

    storage.playback.setPlaybackOptions('useNativeAudioEngine', true);
    player = new AudioPlayer(mockQueuesManager);
    player.audio.load = vi.fn();
    (player as any).isNativeEngineActive = true;
  });

  afterEach(() => {
    player?.destroy();
    vi.clearAllMocks();
  });

  it('delegates active crossfade to nativeBackend when native engine is active', async () => {
    const nextSong = { songId: 202, path: 'nora://songs/track202.flac' };
    const clampedDurationMs = 2500;
    
    // Ensure native backend is mocked and crossfade session is active
    const nativeBackendMock = {
      preload: vi.fn().mockResolvedValue(true),
      crossfade: vi.fn().mockResolvedValue(true),
      destroy: vi.fn(),
      pause: vi.fn().mockResolvedValue(true),
      setDsp: vi.fn().mockResolvedValue(true),
      setVolume: vi.fn().mockResolvedValue(true)
    };
    (player as any).nativeBackend = nativeBackendMock;
    (player as any).crossfadeScheduler = {
      getSessionId: () => 1,
      getState: () => 'FADING',
      cancel: () => {}
    };

    const delegate = (player as any).createCrossfadeDelegate();

    // Simulate preloading the standby slot
    await delegate.preloadTrack(nextSong.songId, 1);
    expect(nativeBackendMock.preload).toHaveBeenCalledWith('nora://songs/track202.flac');
    expect((player as any).preloadedSongData).toEqual(nextSong);

    // Simulate crossfade trigger
    await delegate.startFade({
      sessionId: 1,
      incomingTrackId: 202,
      clampedFadeDuration: 2.5,
      fadeOutCurve: new Float32Array(0),
      fadeInCurve: new Float32Array(0)
    });

    expect(nativeBackendMock.crossfade).toHaveBeenCalledWith(2500);

    // Expect track to be swapped and position reset immediately for UI
    expect((player as any).activeSlot).toBe('B');
    expect((player as any).nativeCurrentPosition).toBe(0);
    expect((player as any).preloadedSongData).toBeNull();
  });

  it('disarms native standby via preload("") when replacing multi-track playback with a 1-song album', async () => {
    let songIds = [101, 102];
    let position = 0;
    const activeQueue = {
      on: vi.fn().mockReturnValue(() => {}),
      get currentSongId() {
        return songIds[position] ?? null;
      },
      get hasNext() {
        return position + 1 < songIds.length;
      },
      get hasPrevious() {
        return position > 0;
      },
      get length() {
        return songIds.length;
      },
      get position() {
        return position;
      },
      get songIds() {
        return songIds;
      },
      moveToNext: vi.fn(() => {
        position += 1;
      }),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn((pos: number) => {
        position = pos;
        return true;
      }),
      moveToStart: vi.fn(),
      isEmpty: false
    };
    mockQueuesManager.getActiveQueue = () => activeQueue;

    const nativeBackendMock = {
      load: vi.fn().mockResolvedValue(true),
      preload: vi.fn().mockResolvedValue(true),
      play: vi.fn().mockResolvedValue(true),
      pause: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
      seek: vi.fn().mockResolvedValue(true),
      setDsp: vi.fn().mockResolvedValue(true),
      setEqualizer: vi.fn().mockResolvedValue(true),
      setSoundProfile: vi.fn().mockResolvedValue(true),
      setVolume: vi.fn().mockResolvedValue(true),
      destroy: vi.fn()
    };
    (player as any).nativeBackend = nativeBackendMock;

    (window.api as any).audioLibraryControls.getSong = vi.fn().mockImplementation((id: number) =>
      Promise.resolve({
        songId: id,
        title: `Song ${id}`,
        duration: 180,
        path: `nora://songs/track${id}.flac`
      })
    );

    // 1. Load Song 101 in a 2-song queue; refreshNativeStandby arms Song 102 in standby.
    await (player as any).loadSong(101, { autoPlay: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(nativeBackendMock.preload).toHaveBeenCalledWith('nora://songs/track102.flac');
    expect((player as any).preloadedSongData?.songId).toBe(102);

    // 2. User switches to a 1-song album (Song 301, hasNext = false).
    songIds = [301];
    position = 0;
    nativeBackendMock.preload.mockClear();

    await (player as any).loadSong(301, { autoPlay: true });
    await Promise.resolve();
    await Promise.resolve();

    expect((player as any).preloadedSongData).toBeNull();
    expect(nativeBackendMock.preload).toHaveBeenCalledWith('');
  });

  it('disarms native standby on repeat-one toggle and fails closed if an unauthorized transition_complete arrives on a 1-song queue', async () => {
    let daemonEventCb: ((ev: any) => void) | null = null;
    (window.api as any).audioEngine.onEvent = vi.fn((cb: any) => {
      daemonEventCb = cb;
      return () => {
        daemonEventCb = null;
      };
    });

    let songIds = [101, 102];
    let position = 0;
    const activeQueue = {
      on: vi.fn().mockReturnValue(() => {}),
      get currentSongId() {
        return songIds[position] ?? null;
      },
      get hasNext() {
        return position + 1 < songIds.length;
      },
      get hasPrevious() {
        return position > 0;
      },
      get length() {
        return songIds.length;
      },
      get position() {
        return position;
      },
      get songIds() {
        return songIds;
      },
      moveToNext: vi.fn(() => {
        position += 1;
      }),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    };
    mockQueuesManager.getActiveQueue = () => activeQueue;

    (window.api as any).audioLibraryControls.getSong = vi.fn().mockImplementation((id: number) =>
      Promise.resolve({
        songId: id,
        title: `Song ${id}`,
        duration: 180,
        path: `nora://songs/track${id}.flac`
      })
    );

    (player as any).initNativeBackend();
    expect(daemonEventCb).not.toBeNull();

    await (player as any).loadSong(101, { autoPlay: true });
    await Promise.resolve();
    await Promise.resolve();
    expect((player as any).preloadedSongData?.songId).toBe(102);

    // Switching repeat mode to 'one' must disarm the preloaded standby.
    sendMock.mockClear();
    player.setRepeatMode('one');
    expect((player as any).preloadedSongData).toBeNull();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ cmd: 'preload', path: '' }));

    // Switch repeat mode back to 'off' on a 1-song album.
    songIds = [101];
    position = 0;
    player.setRepeatMode('off');
    sendMock.mockClear();

    const playbackCompleteSpy = vi.fn();
    const songChangeSpy = vi.fn();
    player.on('playbackComplete', playbackCompleteSpy);
    player.on('songChange', songChangeSpy);

    // Simulate an unexpected/unauthorized daemon transition_complete into Slot B.
    daemonEventCb!({ event: 'transition_complete', active_slot: 'b' });

    expect(songChangeSpy).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ cmd: 'stop' }));
    expect(playbackCompleteSpy).toHaveBeenCalledTimes(1);
    expect((player as any).currentSongData?.songId).toBe(101);
  });

  it('adopts legitimate gapless transition_complete when standby preload matches peekNextTrackId', async () => {
    let daemonEventCb: ((ev: any) => void) | null = null;
    (window.api as any).audioEngine.onEvent = vi.fn((cb: any) => {
      daemonEventCb = cb;
      return () => {
        daemonEventCb = null;
      };
    });

    const songIds = [101, 102];
    let position = 0;
    const activeQueue = {
      on: vi.fn().mockReturnValue(() => {}),
      get currentSongId() {
        return songIds[position] ?? null;
      },
      get hasNext() {
        return position + 1 < songIds.length;
      },
      get hasPrevious() {
        return position > 0;
      },
      get length() {
        return songIds.length;
      },
      get position() {
        return position;
      },
      get songIds() {
        return songIds;
      },
      moveToNext: vi.fn(() => {
        position += 1;
      }),
      moveToPrevious: vi.fn(),
      moveToPosition: vi.fn(),
      moveToStart: vi.fn(),
      isEmpty: false
    };
    mockQueuesManager.getActiveQueue = () => activeQueue;

    (window.api as any).audioLibraryControls.getSong = vi.fn().mockImplementation((id: number) =>
      Promise.resolve({
        songId: id,
        title: `Song ${id}`,
        duration: 180,
        path: `nora://songs/track${id}.flac`
      })
    );

    (player as any).initNativeBackend();
    await (player as any).loadSong(101, { autoPlay: true });
    await Promise.resolve();
    await Promise.resolve();
    expect((player as any).preloadedSongData?.songId).toBe(102);

    const songChangeSpy = vi.fn();
    player.on('songChange', songChangeSpy);

    daemonEventCb!({ event: 'transition_complete', active_slot: 'b' });

    expect((player as any).activeSlot).toBe('B');
    expect((player as any).currentSongData?.songId).toBe(102);
    expect(activeQueue.moveToNext).toHaveBeenCalledTimes(1);
    expect(songChangeSpy).toHaveBeenCalledWith(expect.objectContaining({ songId: 102 }));
  });
});
