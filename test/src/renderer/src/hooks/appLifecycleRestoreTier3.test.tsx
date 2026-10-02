// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

// T3-1: startup restore outcome tracing. Both restore paths log
// start/success/failure with their songId; failures keep their console.error
// but no longer disappear without a path tag.

import { useAppLifecycle } from '@renderer/hooks/useAppLifecycle';
import { dispatch, store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    audio: {
      currentTime: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    },
    toggleShuffling: vi.fn(),
    toggleRepeat: vi.fn(),
    playSongFromUnknownSource: vi.fn(),
    playSong: vi.fn(),
    changeUpNextSongData: vi.fn(),
    managePlaybackErrors: vi.fn(),
    toggleSongPlayback: vi.fn(),
    handleSkipBackwardClick: vi.fn(),
    handleSkipForwardClick: vi.fn(),
    refStartPlay: { current: false },
    windowManagement: { addSongTitleToTitleBar: vi.fn(), resetTitleBarInfo: vi.fn() },
    ...overrides
  };
}

function mockApi(overrides: Record<string, any> = {}) {
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.api = {
    audioLibraryControls: {
      checkForStartUpSongs: vi.fn().mockResolvedValue(null),
      getAllSongIds: vi.fn().mockResolvedValue([]),
      getSong: vi.fn()
    },
    quitEvent: {
      beforeQuitEvent: vi.fn(),
      removeBeforeQuitEventListener: vi.fn(),
      sendBeforeQuitEventAck: vi.fn()
    },
    unknownSource: {
      playSongFromUnknownSource: vi.fn(),
      removePlaySongFromUnknownSourceEvent: vi.fn()
    },
    playerControls: {
      toggleSongPlayback: vi.fn(),
      skipBackwardToPreviousSong: vi.fn(),
      skipForwardToNextSong: vi.fn(),
      removeTogglePlaybackStateEvent: vi.fn(),
      removeSkipBackwardToPreviousSongEvent: vi.fn(),
      removeSkipForwardToNextSongEvent: vi.fn(),
      songPlaybackStateChange: vi.fn()
    },
    dataUpdates: { removeDataUpdateEventListeners: vi.fn() },
    ...overrides
  };
}

describe('T3-1 startup restore tracing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  const loggedSteps = () =>
    logSpy.mock.calls
      .filter((c) => typeof c[0] === 'string' && c[0].startsWith('[StartupRestore]'))
      .map((c) => c[0].replace('[StartupRestore] ', ''));

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApi();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('traces the unknown-source branch with its songId', async () => {
    (window.api as any).audioLibraryControls.checkForStartUpSongs.mockResolvedValue({
      songId: 11,
      title: 'Startup Song'
    });
    const deps = makeDeps();
    renderHook(() => useAppLifecycle(deps as any));
    await act(async () => {});
    const steps = loggedSteps();
    expect(steps).toContain('pathA.start');
    expect(steps).toContain('pathA.unknown-source');
    expect(deps.playSongFromUnknownSource).toHaveBeenCalledTimes(1);
  });

  it('traces the persisted-song branch and the empty-library branch', async () => {
    dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
    dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: { songId: 42 } } as any);
    const deps = makeDeps();
    renderHook(() => useAppLifecycle(deps as any));
    await act(async () => {});
    const steps = loggedSteps();
    expect(steps).toContain('pathA.persisted-song');
    expect(deps.playSong).toHaveBeenCalledWith(42, false);
    expect(steps).toContain('pathB.no-songs');
  });

  it('tags restore rejections with their path instead of swallowing them', async () => {
    dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
    const failure = new Error('startup db unavailable');
    (window.api as any).audioLibraryControls.checkForStartUpSongs.mockRejectedValue(failure);
    (window.api as any).audioLibraryControls.getAllSongIds.mockRejectedValue(failure);
    renderHook(() => useAppLifecycle(makeDeps() as any));
    await act(async () => {});
    const steps = loggedSteps();
    expect(steps).toContain('pathA.failed');
    expect(steps).toContain('pathB.failed');
    expect(errSpy).toHaveBeenCalled();
  });

  describe('Phase A: startup serialization and position restore', () => {
    it('native ON + persisted position > 0: awaits playSong and restores currentTime and position', async () => {
      dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
      storage.playback.setPlaybackOptions('useNativeAudioEngine', true);
      storage.playback.setCurrentSongOptions('songId', 1614);
      storage.playback.setCurrentSongOptions('stoppedPosition', 24.5);

      let playSongResolved = false;
      const deps = makeDeps({
        playSong: vi.fn().mockImplementation(async (songId: number) => {
          await new Promise((r) => setTimeout(r, 10));
          dispatch({
            type: 'CURRENT_SONG_DATA_CHANGE',
            data: { songId, title: 'Test Song' }
          } as any);
          playSongResolved = true;
        })
      });

      renderHook(() => useAppLifecycle(deps as any));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      expect(deps.playSong).toHaveBeenCalledWith(1614, false);
      expect(playSongResolved).toBe(true);
      expect(deps.audio.currentTime).toBe(24.5);
      expect(store.state.player.songPosition).toBe(24.5);
      expect(store.state.currentSongData?.songId).toBe(1614);
      expect(loggedSteps()).toContain('pathA.persisted-song-restored');
    });

    it('native OFF + persisted position > 0: restores position correctly in WebAudio mode', async () => {
      dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
      storage.playback.setPlaybackOptions('useNativeAudioEngine', false);
      storage.playback.setCurrentSongOptions('songId', 1614);
      storage.playback.setCurrentSongOptions('stoppedPosition', 12.0);

      const deps = makeDeps({
        playSong: vi.fn().mockImplementation(async (songId: number) => {
          dispatch({
            type: 'CURRENT_SONG_DATA_CHANGE',
            data: { songId, title: 'WebAudio Track' }
          } as any);
        })
      });

      renderHook(() => useAppLifecycle(deps as any));
      await act(async () => {});

      expect(deps.playSong).toHaveBeenCalledWith(1614, false);
      expect(deps.audio.currentTime).toBe(12.0);
      expect(store.state.player.songPosition).toBe(12.0);
      expect(store.state.currentSongData?.songId).toBe(1614);
      expect(loggedSteps()).toContain('pathA.persisted-song-restored');
    });

    it('playSong failure: position restore does not create bogus state or seek', async () => {
      dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
      dispatch({ type: 'CURRENT_SONG_DATA_CHANGE', data: { songId: 100 } } as any);
      dispatch({ type: 'UPDATE_SONG_POSITION', data: 0 } as any);
      storage.playback.setCurrentSongOptions('songId', 9999);
      storage.playback.setCurrentSongOptions('stoppedPosition', 45.0);

      const deps = makeDeps({
        audio: { currentTime: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        playSong: vi.fn().mockImplementation(async () => {
          throw new Error('Unplayable file');
        })
      });

      renderHook(() => useAppLifecycle(deps as any));
      await act(async () => {});

      expect(deps.playSong).toHaveBeenCalledWith(9999, false);
      expect(deps.audio.currentTime).toBe(0);
      expect(store.state.player.songPosition).toBe(0);
      expect(loggedSteps()).not.toContain('pathA.persisted-song-restored');
    });

    it('StrictMode double invocation: unmounted first instance does not duplicate or corrupt restore', async () => {
      dispatch({ type: 'UPDATE_QUEUE', data: { queues: [] } } as any);
      storage.playback.setCurrentSongOptions('songId', 777);
      storage.playback.setCurrentSongOptions('stoppedPosition', 18.0);

      const deps = makeDeps({
        playSong: vi.fn().mockImplementation(async (songId: number) => {
          await new Promise((r) => setTimeout(r, 20));
          dispatch({
            type: 'CURRENT_SONG_DATA_CHANGE',
            data: { songId, title: 'StrictMode Track' }
          } as any);
        })
      });

      const { unmount } = renderHook(() => useAppLifecycle(deps as any));
      unmount();

      renderHook(() => useAppLifecycle(deps as any));

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(deps.audio.currentTime).toBe(18.0);
      expect(store.state.player.songPosition).toBe(18.0);
      expect(store.state.currentSongData?.songId).toBe(777);
    });
  });
});
