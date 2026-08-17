/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import Song from '../../../../../../src/renderer/src/components/SongsPage/Song';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { songQuery } from '../../../../../../src/renderer/src/queries/songs';
import { queryClient } from '../../../../../../src/renderer/src/queryClient';
import { dispatch } from '../../../../../../src/renderer/src/store/store';

// Spy on Song row executions via Img render tracker
const songRenderCounts: Record<number, number> = {};

// Mock dependencies
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any, options?: any) => {
        const opts = typeof defaultValOrOptions === 'object' ? defaultValOrOptions : options;
        if (key === 'song.selectedSongCount' && opts?.count) {
          return `${opts.count} songs selected`;
        }
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: (props: any) => {
    const match = props.src?.match(/cover_(\d+)\.webp/);
    if (match) {
      const songId = Number(match[1]);
      songRenderCounts[songId] = (songRenderCounts[songId] || 0) + 1;
    }
    return <img alt="song cover" data-testid="song-img" {...props} />;
  }
}));

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, title, className, ...rest }: any) => (
    <span data-testid="nav-link" title={title} className={className} {...rest}>
      {children}
    </span>
  )
}));

vi.mock('../../../../../../src/renderer/src/hooks/useQueueOperations', () => ({
  useQueueOperations: () => ({
    addToNext: vi.fn(),
    addToEnd: vi.fn(),
    removeSongs: vi.fn(),
    clearQueue: vi.fn(),
    playNext: vi.fn()
  })
}));

const mockContextValue: AppUpdateContextType = {
  updateCurrentSongData: vi.fn(),
  updateContextMenuData: vi.fn(),
  changePromptMenuData: vi.fn(),
  changeUpNextSongData: vi.fn(),
  updatePromptMenuHistoryIndex: vi.fn(),
  playSong: vi.fn(),
  addNewNotifications: vi.fn(),
  updateNotifications: vi.fn(),
  createQueue: vi.fn(),
  changeQueueCurrentSongIndex: vi.fn(),
  updateCurrentSongPlaybackState: vi.fn(),
  updatePlayerType: vi.fn(),
  handleSkipBackwardClick: vi.fn(),
  handleSkipForwardClick: vi.fn(),
  updateSongPosition: vi.fn(),
  updateVolume: vi.fn(),
  toggleMutedState: vi.fn(),
  toggleRepeat: vi.fn(),
  toggleShuffling: vi.fn(),
  toggleQueueShuffle: vi.fn(),
  toggleIsFavorite: vi.fn(),
  toggleSongPlayback: vi.fn(),
  updateQueueData: vi.fn(),
  clearAudioPlayerData: vi.fn(),
  updateBodyBackgroundImage: vi.fn(),
  updateMultipleSelections: vi.fn(),
  toggleMultipleSelections: vi.fn(),
  toggleLyricsDrawer: vi.fn(),
  updateAppUpdatesState: vi.fn(),
  updateEqualizerOptions: vi.fn()
};

const createSongProps = (id: number, isAFavorite = false) => ({
  songId: id,
  title: `Test Song ${id}`,
  duration: 200 + id,
  path: `/music/test${id}.mp3`,
  artworkPaths: {
    isDefaultArtwork: true,
    artworkPath: `/artworks/cover_${id}.webp`,
    optimizedArtworkPath: `/artworks/cover_${id}.webp`
  },
  index: id - 1,
  isIndexingSongs: true,
  isAFavorite,
  artists: [{ artistId: 1, name: 'Artist A' }],
  album: { albumId: 1, name: 'Album A' }
});

describe('Song Component - Detailed Render Instrumentation & Correctness Audit', () => {
  beforeEach(() => {
    // Clear counts
    for (const key in songRenderCounts) {
      delete songRenderCounts[key];
    }
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_DATA_CHANGE',
        data: { songId: 999, isAFavorite: false } as any
      });
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: false
      });
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: { isEnabled: false, selectionType: 'songs', multipleSelections: [] }
      });
    });

    if (typeof window !== 'undefined') {
      (window as any).api = {
        playerControls: {
          toggleLikeSongs: vi.fn().mockResolvedValue({ likes: [10], dislikes: [] })
        },
        properties: {
          isInDevelopment: false
        }
      };
    }
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders correctly and isolates re-renders across 25 mounted rows', () => {
    const songListProps = Array.from({ length: 25 }, (_, i) => createSongProps(i + 1));

    const ListWrapper = () => (
      <AppUpdateContext.Provider value={mockContextValue}>
        <div>
          {songListProps.map((props) => (
            <Song key={props.songId} {...props} />
          ))}
        </div>
      </AppUpdateContext.Provider>
    );

    render(<ListWrapper />);

    // 1. Initial Mount: All 25 rows render once
    expect(Object.keys(songRenderCounts).length).toBe(25);
    const initialTotalRenders = Object.values(songRenderCounts).reduce((a, b) => a + b, 0);
    expect(initialTotalRenders).toBe(25);

    // Snapshot helper
    const snapshot = () => ({ ...songRenderCounts });
    const countDelta = (prev: Record<number, number>) => {
      let delta = 0;
      for (const id in songRenderCounts) {
        delta += (songRenderCounts[id] || 0) - (prev[id] || 0);
      }
      return delta;
    };

    // 2. Volume change: Expected = 0 row renders
    let before = snapshot();
    act(() => {
      dispatch({
        type: 'UPDATE_VOLUME_VALUE',
        data: 80
      });
    });
    let delta = countDelta(before);
    console.log(
      `[VERIFIED] Volume change -> ${delta} Song re-renders across 25 rows (Expected: 0)`
    );
    expect(delta).toBe(0);

    // 3. Play/Pause toggle on current song (Song 1): Expected = 1 row render
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_DATA_CHANGE',
        data: { songId: 1, isAFavorite: false } as any
      });
    });
    before = snapshot();
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_PLAYBACK_STATE',
        data: true
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Play/pause toggle -> ${delta} Song re-renders across 25 rows (Expected: 1)`
    );
    expect(delta).toBe(1);
    expect(songRenderCounts[1] - before[1]).toBe(1);

    // 4. Track change (Song 1 -> Song 5): Expected = 2 row renders (Song 1 & Song 5)
    before = snapshot();
    act(() => {
      dispatch({
        type: 'CURRENT_SONG_DATA_CHANGE',
        data: { songId: 5, isAFavorite: false } as any
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Track switch (1 -> 5) -> ${delta} Song re-renders across 25 rows (Expected: 2)`
    );
    expect(delta).toBe(2);
    expect(songRenderCounts[1] - before[1]).toBe(1);
    expect(songRenderCounts[5] - before[5]).toBe(1);

    // 5. Enter multi-selection mode with Song 10: All 25 rows show checkbox (Expected: 25)
    before = snapshot();
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [10]
        }
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Enter multi-selection mode -> ${delta} Song re-renders across 25 rows (Expected: 25)`
    );
    expect(delta).toBe(25);

    // 6. Select another song (Song 12, now [10, 12]) while multi-selection is ALREADY enabled: Expected = 1 row render (Song 12 only!)
    before = snapshot();
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [10, 12]
        }
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Select Song 12 in multi-selection -> ${delta} Song re-renders across 25 rows (Expected: 1)`
    );
    expect(delta).toBe(1);
    expect(songRenderCounts[12] - before[12]).toBe(1);

    // 7. Deselect Song 10 (now [12]) while multi-selection is enabled: Expected = 1 row render (Song 10 only!)
    before = snapshot();
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [12]
        }
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Deselect Song 10 in multi-selection -> ${delta} Song re-renders across 25 rows (Expected: 1)`
    );
    expect(delta).toBe(1);
    expect(songRenderCounts[10] - before[10]).toBe(1);

    // 8. Unrelated queue/repeat change: Expected = 0 row renders
    before = snapshot();
    act(() => {
      dispatch({
        type: 'UPDATE_IS_REPEATING_STATE',
        data: 'repeat-1'
      });
    });
    delta = countDelta(before);
    console.log(
      `[VERIFIED] Unrelated store update -> ${delta} Song re-renders across 25 rows (Expected: 0)`
    );
    expect(delta).toBe(0);
  });

  it('Test A (Favorite Isolation): Liking/updating Song 10 in list only re-renders Song 10 without re-rendering other rows', () => {
    const initialSongs = Array.from({ length: 25 }, (_, i) => createSongProps(i + 1, false));

    let updateSongsState: React.Dispatch<React.SetStateAction<typeof initialSongs>>;

    const ReactiveList = () => {
      const [songs, setSongs] = useState(initialSongs);
      updateSongsState = setSongs;

      return (
        <AppUpdateContext.Provider value={mockContextValue}>
          <div>
            {songs.map((props) => (
              <Song key={props.songId} {...props} />
            ))}
          </div>
        </AppUpdateContext.Provider>
      );
    };

    render(<ReactiveList />);

    const snapshot = () => ({ ...songRenderCounts });
    const before = snapshot();

    // Toggle isAFavorite on Song 10 only (preserving object references for Songs 1..9 and 11..25)
    act(() => {
      updateSongsState((prev) =>
        prev.map((s) => (s.songId === 10 ? { ...s, isAFavorite: true } : s))
      );
    });

    const diff10 = (songRenderCounts[10] || 0) - (before[10] || 0);
    console.log('[VERIFIED] Like Song 10 -> Song 10 renders:', diff10);

    // Verify Song 10 re-rendered with new props
    expect(diff10).toBe(1);

    // Verify all other 24 songs were skipped by React.memo and did not re-render
    for (let id = 1; id <= 25; id++) {
      if (id !== 10) {
        expect((songRenderCounts[id] || 0) - (before[id] || 0)).toBe(0);
      }
    }
  });

  it('Test B (Virtuoso Row Reuse & Identity): Reusing component instance with different song props never carries over stale favorite state', () => {
    // Initial render in slot 1 with Song 1 (isAFavorite = true)
    const initialProps = createSongProps(1, true);

    const { rerender } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <Song {...initialProps} />
      </AppUpdateContext.Provider>
    );

    // Verify Song 1 shows liked tooltip
    expect(screen.getByTitle('song.likedThisSong')).toBeDefined();

    // Virtuoso reuses the mounted component slot for Song 2 (isAFavorite = false)
    const reusedSlotProps = createSongProps(2, false);

    rerender(
      <AppUpdateContext.Provider value={mockContextValue}>
        <Song {...reusedSlotProps} />
      </AppUpdateContext.Provider>
    );

    // Verify Song 2 displays correctly as unliked and did NOT inherit Song 1's liked state!
    expect(screen.getByTitle('song.dislikedThisSong')).toBeDefined();
    expect(screen.queryByTitle('song.likedThisSong')).toBeNull();
  });

  it('Test C (Multi-Selection Like Toggle Semantics): Multi-select toggle like preserves individual toggle semantics and exact cache updates', async () => {
    const toggleLikeSongsMock = vi.fn().mockResolvedValue({
      likes: [2],
      dislikes: [1, 3]
    });
    (window as any).api.playerControls.toggleLikeSongs = toggleLikeSongsMock;

    let contextMenuCallback: any;
    const customContext: AppUpdateContextType = {
      ...mockContextValue,
      updateContextMenuData: vi.fn((_open, items) => {
        contextMenuCallback = items;
      })
    };

    // Enable multi-selection for [1, 2, 3]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [1, 2, 3]
        }
      });
    });

    const songProps = createSongProps(1, true);

    render(
      <AppUpdateContext.Provider value={customContext}>
        <Song {...songProps} />
      </AppUpdateContext.Provider>
    );

    // Seed query cache with initial states
    const testKey = songQuery.all({
      sortType: 'aToZ',
      filterType: 'notSelected',
      start: 0,
      end: 0,
      keyword: ''
    }).queryKey;
    queryClient.setQueryData(testKey, {
      data: [
        { songId: 1, isAFavorite: true },
        { songId: 2, isAFavorite: false },
        { songId: 3, isAFavorite: true }
      ],
      total: 3,
      sortType: 'aToZ',
      start: 0,
      end: 0
    });

    // Right-click on Song 1 (which is part of the selection)
    const songElement = screen.getByText('Test Song 1').closest('.group') as HTMLElement;
    fireEvent.contextMenu(songElement);

    // Find the toggle like action
    const toggleLikeItem = contextMenuCallback?.find((item: any) => item.iconName === 'favorite');
    expect(toggleLikeItem).toBeDefined();

    // Execute toggle like
    await act(async () => {
      toggleLikeItem.handlerFunction();
    });

    // Verify toggleLikeSongs was called with all selected IDs without forcing boolean isLikeSong
    expect(toggleLikeSongsMock).toHaveBeenCalledWith([1, 2, 3]);

    // Verify React Query cache reflects exact toggles: Song 2 is liked, Songs 1 & 3 are unliked
    const updatedCache = queryClient.getQueryData<any>(testKey);
    expect(updatedCache?.data.find((s: any) => s.songId === 1)?.isAFavorite).toBe(false);
    expect(updatedCache?.data.find((s: any) => s.songId === 2)?.isAFavorite).toBe(true);
    expect(updatedCache?.data.find((s: any) => s.songId === 3)?.isAFavorite).toBe(false);
  });

  it('Test D (AppUpdateContext Provider Stability): Stable context values do NOT cause spurious re-renders on mounted Song rows', () => {
    const songListProps = Array.from({ length: 25 }, (_, i) => createSongProps(i + 1));

    let setParentState: React.Dispatch<React.SetStateAction<number>>;

    const StableContextParent = () => {
      const [count, setCount] = useState(0);
      setParentState = setCount;

      return (
        <AppUpdateContext.Provider value={mockContextValue}>
          <div data-count={count}>
            {songListProps.map((props) => (
              <Song key={props.songId} {...props} />
            ))}
          </div>
        </AppUpdateContext.Provider>
      );
    };

    render(<StableContextParent />);

    const snapshot = () => ({ ...songRenderCounts });
    const before = snapshot();

    // Re-render parent while context value remains stable (mimicking App.tsx useMemo)
    act(() => {
      setParentState(1);
    });

    // All 25 rows must be skipped by React.memo (0 renders)
    let delta = 0;
    for (const id in songRenderCounts) {
      delta += (songRenderCounts[id] || 0) - (before[id] || 0);
    }
    console.log(
      `[VERIFIED] Parent re-render with stable context -> ${delta} Song re-renders across 25 rows (Expected: 0)`
    );
    expect(delta).toBe(0);
  });

  it('Test E (Context Menu Semantics on Selected vs Unselected Rows): Right-clicking selected row opens bulk menu, unselected row opens single-song menu', () => {
    let capturedHeaderData: any = null;
    let capturedMenuItems: any = null;

    const customContext: AppUpdateContextType = {
      ...mockContextValue,
      updateContextMenuData: vi.fn((_open, items, _x, _y, additionalData) => {
        capturedMenuItems = items;
        capturedHeaderData = additionalData;
      })
    };

    // Selection active with songs [1, 2, 3]
    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [1, 2, 3]
        }
      });
    });

    const song1Props = createSongProps(1, false);
    const song8Props = createSongProps(8, false);

    render(
      <AppUpdateContext.Provider value={customContext}>
        <div>
          <Song key={1} {...song1Props} />
          <Song key={8} {...song8Props} />
        </div>
      </AppUpdateContext.Provider>
    );

    // Case 1: Right-click Song 1 (isAMultipleSelection = true)
    const song1Element = screen.getByText('Test Song 1').closest('.group') as HTMLElement;
    fireEvent.contextMenu(song1Element);

    expect(capturedHeaderData?.title).toBe('3 songs selected');
    // Bulk createQueue option is enabled
    const bulkQueueOption = capturedMenuItems.find(
      (item: any) => item.label === 'common.createAQueue'
    );
    expect(bulkQueueOption?.isDisabled).toBe(false);

    // Case 2: Right-click Song 8 (isAMultipleSelection = false, not part of selection)
    const song8Element = screen.getByText('Test Song 8').closest('.group') as HTMLElement;
    fireEvent.contextMenu(song8Element);

    expect(capturedHeaderData?.title).toBe('Test Song 8');
    // Bulk createQueue option is disabled (operates as single song)
    const singleQueueOption = capturedMenuItems.find(
      (item: any) => item.label === 'common.createAQueue'
    );
    expect(singleQueueOption?.isDisabled).toBe(true);
  });

  it('Test F (Rapid Favorite Toggles & Out-of-Order Failure): Out-of-order rejection does not overwrite later state', async () => {
    let rejectCall1: any;
    const call1Promise = new Promise((_resolve, reject) => {
      rejectCall1 = reject;
    });

    let resolveCall2: any;
    const call2Promise = new Promise((resolve) => {
      resolveCall2 = resolve;
    });

    let callCount = 0;
    const toggleLikeSongsMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return call1Promise;
      return call2Promise;
    });
    (window as any).api.playerControls.toggleLikeSongs = toggleLikeSongsMock;

    const testQuery = songQuery.all({
      sortType: 'aToZ',
      filterType: 'notSelected',
      start: 0,
      end: 0,
      keyword: ''
    });
    queryClient.setQueryData(testQuery.queryKey, {
      data: [{ songId: 10, isAFavorite: false }],
      total: 1,
      sortType: 'aToZ',
      start: 0,
      end: 0
    });

    const ReactiveSong = () => {
      const { data } = useQuery({
        queryKey: testQuery.queryKey,
        queryFn: () => ({
          data: [{ songId: 10, isAFavorite: false }],
          total: 1,
          sortType: 'aToZ' as const,
          start: 0,
          end: 0
        })
      });
      const songData = data?.data[0] || { songId: 10, isAFavorite: false };
      return (
        <AppUpdateContext.Provider value={mockContextValue}>
          <Song {...createSongProps(10, songData.isAFavorite)} isAFavorite={songData.isAFavorite} />
        </AppUpdateContext.Provider>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ReactiveSong />
      </QueryClientProvider>
    );

    const song10Element = screen.getByText('Test Song 10').closest('.group') as HTMLElement;
    const favBtn = song10Element.querySelector(
      'button[title*="disliked"], button[title*="liked"]'
    ) as HTMLButtonElement;

    // Rapid Click 1: toggles false -> true (Mutation Seq = 1)
    await act(async () => {
      fireEvent.click(favBtn);
    });
    let cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(true);

    const updatedFavBtn = await screen.findByTitle('song.likedThisSong');

    // Rapid Click 2: toggles true -> false (Mutation Seq = 2)
    await act(async () => {
      fireEvent.click(updatedFavBtn);
    });
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);

    // Now Call 1 rejects with error (arrives late)
    await act(async () => {
      rejectCall1(new Error('Network error on Call 1'));
    });

    // Verify cache remains FALSE (not corrupted back to true by stale Call 1 rollback)
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);

    // Call 2 resolves successfully
    await act(async () => {
      resolveCall2({ likes: [], dislikes: [10] });
    });

    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);
  });

  it('Test G (Multi-Selection IPC Failure): IPC rejection preserves existing states and shows error notification', async () => {
    const toggleLikeSongsMock = vi.fn().mockRejectedValue(new Error('IPC Database Locked'));
    (window as any).api.playerControls.toggleLikeSongs = toggleLikeSongsMock;

    const addNewNotificationsMock = vi.fn();
    let contextMenuCallback: any;

    const customContext: AppUpdateContextType = {
      ...mockContextValue,
      addNewNotifications: addNewNotificationsMock,
      updateContextMenuData: vi.fn((_open, items) => {
        contextMenuCallback = items;
      })
    };

    act(() => {
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: [1, 2, 3]
        }
      });
    });

    const testKey = songQuery.all({
      sortType: 'aToZ',
      filterType: 'notSelected',
      start: 0,
      end: 0,
      keyword: ''
    }).queryKey;
    const initialData = [
      { songId: 1, isAFavorite: true },
      { songId: 2, isAFavorite: false },
      { songId: 3, isAFavorite: true }
    ];
    queryClient.setQueryData(testKey, {
      data: initialData,
      total: 3,
      sortType: 'aToZ',
      start: 0,
      end: 0
    });

    const song1Props = createSongProps(1, true);

    render(
      <AppUpdateContext.Provider value={customContext}>
        <Song {...song1Props} />
      </AppUpdateContext.Provider>
    );

    const song1Element = screen.getByText('Test Song 1').closest('.group') as HTMLElement;
    fireEvent.contextMenu(song1Element);

    const toggleLikeItem = contextMenuCallback?.find((item: any) => item.iconName === 'favorite');
    expect(toggleLikeItem).toBeDefined();

    await act(async () => {
      toggleLikeItem.handlerFunction();
    });

    // Verify cache remains untouched
    const currentCache = queryClient.getQueryData<any>(testKey);
    expect(currentCache?.data).toEqual(initialData);

    // Verify error notification was dispatched
    expect(addNewNotificationsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'toggleLikeError-multi',
          iconName: 'error'
        })
      ])
    );
  });

  it('Test H (Late-Success Out-of-Order Resolution): Out-of-order resolution does not overwrite newer state', async () => {
    let resolveCall1: any;
    const call1Promise = new Promise((resolve) => {
      resolveCall1 = resolve;
    });

    let resolveCall2: any;
    const call2Promise = new Promise((resolve) => {
      resolveCall2 = resolve;
    });

    let callCount = 0;
    const toggleLikeSongsMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return call1Promise;
      return call2Promise;
    });
    (window as any).api.playerControls.toggleLikeSongs = toggleLikeSongsMock;

    const testQuery = songQuery.all({
      sortType: 'aToZ',
      filterType: 'notSelected',
      start: 0,
      end: 0,
      keyword: ''
    });
    queryClient.setQueryData(testQuery.queryKey, {
      data: [{ songId: 10, isAFavorite: false }],
      total: 1,
      sortType: 'aToZ',
      start: 0,
      end: 0
    });

    const ReactiveSong = () => {
      const { data } = useQuery({
        queryKey: testQuery.queryKey,
        queryFn: () => ({
          data: [{ songId: 10, isAFavorite: false }],
          total: 1,
          sortType: 'aToZ' as const,
          start: 0,
          end: 0
        })
      });
      const songData = data?.data[0] || { songId: 10, isAFavorite: false };
      return (
        <AppUpdateContext.Provider value={mockContextValue}>
          <Song {...createSongProps(10, songData.isAFavorite)} isAFavorite={songData.isAFavorite} />
        </AppUpdateContext.Provider>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ReactiveSong />
      </QueryClientProvider>
    );

    const song10Element = screen.getByText('Test Song 10').closest('.group') as HTMLElement;
    const favBtn = song10Element.querySelector(
      'button[title*="disliked"], button[title*="liked"]'
    ) as HTMLButtonElement;

    // Click 1: false -> true (seq 1)
    await act(async () => {
      fireEvent.click(favBtn);
    });
    let cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(true);

    const updatedFavBtn = await screen.findByTitle('song.likedThisSong');

    // Click 2: true -> false (seq 2)
    await act(async () => {
      fireEvent.click(updatedFavBtn);
    });
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);

    // Call 1 resolves LATE with { likes: [10] } (which wants true)
    await act(async () => {
      resolveCall1({ likes: [10], dislikes: [] });
    });

    // Verify cache remains FALSE (not overridden back to true by stale Call 1 resolution!)
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);

    // Call 2 resolves
    await act(async () => {
      resolveCall2({ likes: [], dislikes: [10] });
    });
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);
  });

  it('Test I (Second Mutation Failure Rollback): Failure on active mutation rolls back to previous valid server state', async () => {
    let rejectCall2: any;
    const call2Promise = new Promise((_resolve, reject) => {
      rejectCall2 = reject;
    });

    let callCount = 0;
    const toggleLikeSongsMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ likes: [10], dislikes: [] });
      return call2Promise;
    });
    (window as any).api.playerControls.toggleLikeSongs = toggleLikeSongsMock;

    const testQuery = songQuery.all({
      sortType: 'aToZ',
      filterType: 'notSelected',
      start: 0,
      end: 0,
      keyword: ''
    });
    queryClient.setQueryData(testQuery.queryKey, {
      data: [{ songId: 10, isAFavorite: false }],
      total: 1,
      sortType: 'aToZ',
      start: 0,
      end: 0
    });

    const ReactiveSong = () => {
      const { data } = useQuery({
        queryKey: testQuery.queryKey,
        queryFn: () => ({
          data: [{ songId: 10, isAFavorite: false }],
          total: 1,
          sortType: 'aToZ' as const,
          start: 0,
          end: 0
        })
      });
      const songData = data?.data[0] || { songId: 10, isAFavorite: false };
      return (
        <AppUpdateContext.Provider value={mockContextValue}>
          <Song {...createSongProps(10, songData.isAFavorite)} isAFavorite={songData.isAFavorite} />
        </AppUpdateContext.Provider>
      );
    };

    render(
      <QueryClientProvider client={queryClient}>
        <ReactiveSong />
      </QueryClientProvider>
    );

    const song10Element = screen.getByText('Test Song 10').closest('.group') as HTMLElement;
    const favBtn = song10Element.querySelector(
      'button[title*="disliked"], button[title*="liked"]'
    ) as HTMLButtonElement;

    // Click 1: false -> true (resolves successfully)
    await act(async () => {
      fireEvent.click(favBtn);
    });
    let cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(true);

    const updatedFavBtn = await screen.findByTitle('song.likedThisSong');

    // Click 2: true -> false (optimistically updates to false, seq 2)
    await act(async () => {
      fireEvent.click(updatedFavBtn);
    });
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(false);

    // Call 2 fails
    await act(async () => {
      rejectCall2(new Error('Network error on Call 2'));
    });

    // Active mutation seq 2 rolls back to true!
    cache = queryClient.getQueryData<any>(testQuery.queryKey);
    expect(cache?.data[0].isAFavorite).toBe(true);
  });
});
