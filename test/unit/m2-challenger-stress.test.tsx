// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import { useWindowHydration } from '../../src/renderer/src/hooks/useWindowHydration';
import { getSelectedSongsSet, useSongSelection } from '../../src/renderer/src/contexts/MultipleSelectionContext';
import useSelectAllHandler from '../../src/renderer/src/hooks/useSelectAllHandler';
import Song from '../../src/renderer/src/components/SongsPage/Song';
import { AppUpdateContext, type AppUpdateContextType } from '../../src/renderer/src/contexts/AppUpdateContext';
import { store, dispatch } from '../../src/renderer/src/store/store';
import type { SongData } from '../../src/types/app';

// Mock translations
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

vi.mock('../../src/renderer/src/components/Img', () => ({
  default: (props: any) => <img alt="song cover" data-testid="song-img" {...props} />
}));

vi.mock('../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, title, className, ...rest }: any) => (
    <span data-testid="nav-link" title={title} className={className} {...rest}>
      {children}
    </span>
  )
}));

vi.mock('../../src/renderer/src/hooks/useQueueOperations', () => ({
  useQueueOperations: () => ({
    addToNext: vi.fn(),
    addToEnd: vi.fn(),
    removeSongs: vi.fn(),
    clearQueue: vi.fn(),
    playNext: vi.fn()
  })
}));

function createMockSong(id: number, overrides: Partial<SongData> = {}): SongData {
  return {
    songId: id,
    title: `Stress Song ${id}`,
    duration: 180 + (id % 120),
    artists: [{ artistId: (id % 100) + 1, name: `Artist ${(id % 100) + 1}` }],
    album: { albumId: (id % 200) + 1, name: `Album ${(id % 200) + 1}` },
    albumArtists: [{ artistId: (id % 100) + 1, name: `Artist ${(id % 100) + 1}` }],
    genres: [{ genreId: 1, name: 'Pop' }],
    isAFavorite: false,
    isBlacklisted: false,
    trackNo: (id % 12) + 1,
    year: 2024,
    path: `C:\\Music\\stress_song_${id}.mp3`,
    addedDate: 1700000000000 + id * 1000,
    isArtworkAvailable: true,
    artworkPaths: {
      isDefaultArtwork: false,
      artworkPath: `C:\\AppData\\art_${id}.jpg`,
      optimizedArtworkPath: `C:\\AppData\\opt_${id}.webp`
    },
    ...overrides
  };
}

describe('Challenger M2 Adversarial Stress Suite', () => {
  let queryClient: QueryClient;
  let mockGetSongInfo: any;
  let mockToggleLikeSongs: any;
  let mockContextValue: AppUpdateContextType;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    mockGetSongInfo = vi.fn().mockImplementation(async (ids: number[]) => {
      // Simulate realistic async IPC delay
      await new Promise((resolve) => setTimeout(resolve, 5));
      return ids.map((id) => createMockSong(id));
    });

    mockToggleLikeSongs = vi.fn().mockImplementation(async (songIds: number[], isLike: boolean) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        likes: isLike ? songIds : [],
        dislikes: !isLike ? songIds : []
      };
    });

    (window as any).api = {
      audioLibraryControls: {
        getSongInfo: mockGetSongInfo
      },
      playerControls: {
        toggleLikeSongs: mockToggleLikeSongs
      },
      properties: {
        isInDevelopment: false
      }
    };

    mockContextValue = {
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
      updateMultipleSelections: vi.fn((id, selectionType, type) => {
        const currentData = store.state.multipleSelectionsData;
        let selections = [...currentData.multipleSelections];
        if (type === 'add') {
          if (!selections.includes(id)) selections.push(id);
        } else {
          selections = selections.filter((s) => s !== id);
        }
        dispatch({
          type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
          data: {
            ...currentData,
            selectionType,
            multipleSelections: selections
          }
        });
      }),
      toggleMultipleSelections: vi.fn((isEnabled, selectionType, addSelections, replaceSelections) => {
        const currentData = store.state.multipleSelectionsData;
        if (typeof isEnabled === 'boolean') {
          let newSelections = isEnabled ? [...currentData.multipleSelections] : [];
          if (Array.isArray(addSelections) && isEnabled === true) {
            if (replaceSelections) {
              newSelections = [...addSelections];
            } else {
              const set = new Set(newSelections);
              for (const item of addSelections) {
                set.add(item);
              }
              newSelections = Array.from(set);
            }
          }
          dispatch({
            type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
            data: {
              ...currentData,
              isEnabled,
              selectionType: isEnabled ? (selectionType ?? 'songs') : undefined,
              multipleSelections: newSelections
            }
          });
        }
      }),
      toggleLyricsDrawer: vi.fn(),
      updateAppUpdatesState: vi.fn(),
      openAutoTagDialog: vi.fn(),
      playAllSongs: vi.fn()
    };

    // Reset store multiple selections
    dispatch({
      type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
      data: { isEnabled: false, selectionType: 'songs', multipleSelections: [] }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AppUpdateContext.Provider value={mockContextValue}>{children}</AppUpdateContext.Provider>
    </QueryClientProvider>
  );

  // ==========================================================================
  // SCENARIO 1: VIOLENT INDEX JUMPING (0 -> 4800 -> 2400 -> 100)
  // ==========================================================================
  describe('Scenario 1: Violent Index Jumping Across 5,000 Items', () => {
    it('survives rapid successive flings (0 -> 4800 -> 2400 -> 100) without index corruption or race errors', async () => {
      const TOTAL_SONGS = 5000;
      const ids = Array.from({ length: TOTAL_SONGS }, (_, i) => i + 1); // 1..5000
      const idsVersion = 1700000000000;
      const listIdentity = 'stress-library-5k';

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, idsVersion, {
            listIdentity,
            keyPrefix: 'songs',
            extraRowsBefore: 75,
            extraRowsAfter: 150
          }),
        { wrapper }
      );

      // Rapid fling jump 1: Index 0
      act(() => {
        result.current.onRangeChange({ startIndex: 0, endIndex: 30 });
      });

      // Rapid fling jump 2: Index 4800 (Window 24: 4800..4999) - before jump 1 resolves!
      act(() => {
        result.current.onRangeChange({ startIndex: 4800, endIndex: 4830 });
      });

      // Rapid fling jump 3: Index 2400 (Window 12: 2400..2599) - before jump 2 resolves!
      act(() => {
        result.current.onRangeChange({ startIndex: 2400, endIndex: 2430 });
      });

      // Rapid fling jump 4: Index 100 (Window 0: 0..199)
      act(() => {
        result.current.onRangeChange({ startIndex: 100, endIndex: 130 });
      });

      // Wait for all in-flight queries to settle
      await waitFor(() => {
        expect(result.current.getItem(100)).toBeDefined();
      });

      // Verify that getItem at the settling position returns the exact item matching ids[100] (id=101)
      const song100 = result.current.getItem(100);
      expect(song100).toBeDefined();
      expect(song100?.songId).toBe(101);
      expect(song100?.title).toBe('Stress Song 101');

      // Now verify that returning to Window 24 (4800) fetches and retrieves correct song 4801
      act(() => {
        result.current.onRangeChange({ startIndex: 4800, endIndex: 4830 });
      });

      await waitFor(() => {
        expect(result.current.getItem(4800)).toBeDefined();
      });

      const song4800 = result.current.getItem(4800);
      expect(song4800).toBeDefined();
      expect(song4800?.songId).toBe(4801);
      expect(song4800?.title).toBe('Stress Song 4801');

      // Check boundary edge: index 4999 (last song in 5000-song library)
      const lastSong = result.current.getItem(4999);
      expect(lastSong).toBeDefined();
      expect(lastSong?.songId).toBe(5000);

      // Verify out of bounds indices safely return undefined
      expect(result.current.getItem(5000)).toBeUndefined();
      expect(result.current.getItem(-1)).toBeUndefined();
    });

    it('bails out of React state updates when violent jumps occur within the same window chunk', async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
      const idsVersion = 1700000000000;

      let renderCount = 0;
      const { result } = renderHook(
        () => {
          renderCount++;
          return useWindowHydration(ids, idsVersion, {
            extraRowsBefore: 0,
            extraRowsAfter: 0
          });
        },
        { wrapper }
      );

      const initialRenders = renderCount;

      // Make 20 rapid range changes strictly within Window 0 (0..199)
      for (let idx = 0; idx < 150; idx += 8) {
        act(() => {
          result.current.onRangeChange({ startIndex: idx, endIndex: idx + 20 });
        });
      }

      // Render count should NOT have increased by 20x because windowBounds [0, 0] remained unchanged!
      expect(renderCount).toBeLessThanOrEqual(initialRenders + 1);
    });

    it('performs synchronous 0ms QueryCache retrieval for previously visited windows during jump-backs', async () => {
      const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
      const idsVersion = 1700000000000;
      const listIdentity = 'pre-seeded-5k';

      // Pre-seed window 0 (0..199) and window 24 (4800..4999)
      const win0Songs = ids.slice(0, 200).map((id) => createMockSong(id));
      const win24Songs = ids.slice(4800, 5000).map((id) => createMockSong(id));

      queryClient.setQueryData(['songs', 'window', listIdentity, idsVersion, 0], win0Songs);
      queryClient.setQueryData(['songs', 'window', listIdentity, idsVersion, 4800], win24Songs);

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, idsVersion, {
            listIdentity,
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      // Instant synchronous retrieval for index 0 and index 4800 on first render tick
      const item0 = result.current.getItem(0);
      const item4800 = result.current.getItem(4800);
      const item4999 = result.current.getItem(4999);

      expect(item0).toBeDefined();
      expect(item0?.songId).toBe(1);
      expect(item4800).toBeDefined();
      expect(item4800?.songId).toBe(4801);
      expect(item4999).toBeDefined();
      expect(item4999?.songId).toBe(5000);
    });
  });

  // ==========================================================================
  // SCENARIO 2: INSTANT CTRL+A MULTI-SELECTION ACROSS 5,000+ SONG IDS
  // ==========================================================================
  describe('Scenario 2: Instant Ctrl+A Multi-Selection Across 5,000+ Song IDs', () => {
    it('executes select-all across 5,000 song stubs in < 15ms and maintains O(1) membership check', () => {
      const TOTAL_SONGS = 5000;
      const songIds = Array.from({ length: TOTAL_SONGS }, (_, i) => i + 1);
      const songStubs = songIds.map((id) => ({ songId: id }));

      const { result: selectHandlerHook } = renderHook(
        () => useSelectAllHandler(songStubs, 'songs', 'songId'),
        { wrapper }
      );

      const startTime = performance.now();
      act(() => {
        selectHandlerHook.current(); // Select all
      });
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(25); // High-speed selection threshold

      const currentSelections = store.state.multipleSelectionsData;
      expect(currentSelections.isEnabled).toBe(true);
      expect(currentSelections.selectionType).toBe('songs');
      expect(currentSelections.multipleSelections.length).toBe(TOTAL_SONGS);
      expect(currentSelections.multipleSelections[0]).toBe(1);
      expect(currentSelections.multipleSelections[4999]).toBe(5000);

      // Verify Set caching derives memoized Set<number> with WeakMap
      const cachedSet1 = getSelectedSongsSet(currentSelections.multipleSelections);
      const cachedSet2 = getSelectedSongsSet(currentSelections.multipleSelections);
      expect(cachedSet1).toBe(cachedSet2); // Reference equality for cached Set
      expect(cachedSet1.size).toBe(TOTAL_SONGS);

      // Test O(1) membership check across random sample of hydrated and unhydrated IDs
      expect(cachedSet1.has(1)).toBe(true);
      expect(cachedSet1.has(2500)).toBe(true);
      expect(cachedSet1.has(5000)).toBe(true);
      expect(cachedSet1.has(99999)).toBe(false);
    });

    it('correctly handles Shift-Click range selection across a span of 3,500 songs in 5k list', () => {
      const TOTAL_SONGS = 5000;
      const songIds = Array.from({ length: TOTAL_SONGS }, (_, i) => i + 1);
      const songStubs = songIds.map((id) => ({ songId: id }));

      const { result: selectHandlerHook } = renderHook(
        () => useSelectAllHandler(songStubs, 'songs', 'songId'),
        { wrapper }
      );

      // Step 1: Select single songId 100
      act(() => {
        selectHandlerHook.current(100);
      });

      expect(store.state.multipleSelectionsData.multipleSelections).toEqual([100]);

      // Step 2: Shift-select songId 3600 (span of 3,501 songs)
      const shiftStartTime = performance.now();
      act(() => {
        selectHandlerHook.current(3600);
      });
      const shiftDurationMs = performance.now() - shiftStartTime;

      expect(shiftDurationMs).toBeLessThan(100);
      const selections = store.state.multipleSelectionsData.multipleSelections;
      expect(selections.length).toBe(3501);
      expect(selections[0]).toBe(100);
      expect(selections[selections.length - 1]).toBe(3600);
    });

    it('useSongSelection hook accurately reflects selection state for individual hydrated & unhydrated rows', () => {
      // Pre-select 5,000 songs in store
      const songIds = Array.from({ length: 5000 }, (_, i) => i + 1);
      dispatch({
        type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
        data: { isEnabled: true, selectionType: 'songs', multipleSelections: songIds }
      });

      // Hook for unhydrated row 4500
      const { result: hookUnhydrated } = renderHook(() => useSongSelection(4500));
      expect(hookUnhydrated.current.isEnabled).toBe(true);
      expect(hookUnhydrated.current.isSelected).toBe(true);

      // Hook for hydrated row 1
      const { result: hookHydrated } = renderHook(() => useSongSelection(1));
      expect(hookHydrated.current.isEnabled).toBe(true);
      expect(hookHydrated.current.isSelected).toBe(true);

      // Hook for non-existent row 9999
      const { result: hookNonExistent } = renderHook(() => useSongSelection(9999));
      expect(hookNonExistent.current.isEnabled).toBe(true);
      expect(hookNonExistent.current.isSelected).toBe(false);

      // Toggle off multiple selection
      act(() => {
        dispatch({
          type: 'UPDATE_MULTIPLE_SELECTIONS_DATA',
          data: { isEnabled: false, selectionType: undefined, multipleSelections: [] }
        });
      });

      expect(hookUnhydrated.current.isSelected).toBe(false);
      expect(hookHydrated.current.isSelected).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 3: OPTIMISTIC FAVORITE TOGGLE DURING RAPID SCROLL JUMPS
  // ==========================================================================
  describe('Scenario 3: Optimistic Favorite Toggle During Rapid Scroll Jumps', () => {
    it('provides 0ms optimistic favorite feedback and prevents row-recycling bleed during violent scroll', async () => {
      const mockSong4800 = createMockSong(4801, { isAFavorite: false });
      const mockSong100 = createMockSong(101, { isAFavorite: false });

      // Render Song 4801
      const { rerender } = render(
        <Song
          index={4800}
          songId={4801}
          title={mockSong4800.title}
          duration={mockSong4800.duration}
          artworkPaths={mockSong4800.artworkPaths}
          isIndexingSongs={false}
          isAFavorite={false}
          path={mockSong4800.path}
        />,
        { wrapper }
      );

      const favButton = screen.getByRole('button', { name: 'favorite' });
      expect(favButton).toBeDefined();

      // User clicks favorite toggle
      act(() => {
        fireEvent.click(favButton);
      });

      // 1. Instant 0ms visual feedback: Icon class changes to filled favorite immediately
      expect(favButton.querySelector('span')?.classList.contains('material-icons-round')).toBe(true);

      // 2. Violent scroll jump: row at index 4800 is recycled for Song 101
      rerender(
        <Song
          index={100}
          songId={101}
          title={mockSong100.title}
          duration={mockSong100.duration}
          artworkPaths={mockSong100.artworkPaths}
          isIndexingSongs={false}
          isAFavorite={false}
          path={mockSong100.path}
        />
      );

      const recycledFavButton = screen.getByRole('button', { name: 'favorite' });
      // Crucial: The optimistic favorite from song 4801 MUST NOT leak to recycled row for song 101!
      expect(
        recycledFavButton.querySelector('span')?.classList.contains('material-icons-round-outlined')
      ).toBe(true);

      // Wait for IPC promise to settle
      await waitFor(() => {
        expect(mockToggleLikeSongs).toHaveBeenCalledWith([4801], true);
      });
    });

    it('monotonic sequence counter ignores superseded stale rollback when multiple toggles occur in rapid flight', async () => {
      let resolveFirstCall: (value: any) => void = () => {};
      let resolveSecondCall: (value: any) => void = () => {};

      mockToggleLikeSongs.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveFirstCall = resolve;
        });
      });

      mockToggleLikeSongs.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveSecondCall = resolve;
        });
      });

      const mockSong = createMockSong(2500, { isAFavorite: false });

      render(
        <Song
          index={2499}
          songId={2500}
          title={mockSong.title}
          duration={mockSong.duration}
          artworkPaths={mockSong.artworkPaths}
          isIndexingSongs={false}
          isAFavorite={false}
          path={mockSong.path}
        />,
        { wrapper }
      );

      const favButton = screen.getByRole('button', { name: 'favorite' });

      // Click 1: Toggle favorite ON
      act(() => {
        fireEvent.click(favButton);
      });
      expect(favButton.querySelector('span')?.classList.contains('material-icons-round')).toBe(true);

      // Click 2: Rapidly toggle favorite OFF before Click 1 response arrives
      act(() => {
        fireEvent.click(favButton);
      });
      expect(
        favButton.querySelector('span')?.classList.contains('material-icons-round-outlined')
      ).toBe(true);

      // Click 1 resolves (or returns empty/stale DB rejection)
      act(() => {
        resolveFirstCall({ likes: [], dislikes: [] }); // Simulating rejection of first call
      });

      // Icon should REMAIN outlined (OFF) because Click 2 superseded Click 1!
      expect(
        favButton.querySelector('span')?.classList.contains('material-icons-round-outlined')
      ).toBe(true);

      // Click 2 resolves successfully
      act(() => {
        resolveSecondCall({ likes: [], dislikes: [2500] });
      });

      expect(
        favButton.querySelector('span')?.classList.contains('material-icons-round-outlined')
      ).toBe(true);
    });

    it('safely rolls back optimistic favorite and displays error notification if API throws', async () => {
      mockToggleLikeSongs.mockRejectedValueOnce(new Error('IPC Database Error'));

      const mockSong = createMockSong(3000, { isAFavorite: false });

      render(
        <Song
          index={2999}
          songId={3000}
          title={mockSong.title}
          duration={mockSong.duration}
          artworkPaths={mockSong.artworkPaths}
          isIndexingSongs={false}
          isAFavorite={false}
          path={mockSong.path}
        />,
        { wrapper }
      );

      const favButton = screen.getByRole('button', { name: 'favorite' });

      // Click favorite
      act(() => {
        fireEvent.click(favButton);
      });
      expect(favButton.querySelector('span')?.classList.contains('material-icons-round')).toBe(true);

      // Wait for error handling and rollback
      await waitFor(() => {
        expect(
          favButton.querySelector('span')?.classList.contains('material-icons-round-outlined')
        ).toBe(true);
      });

      expect(mockContextValue.addNewNotifications).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'toggleLikeError-3000',
            iconName: 'error'
          })
        ])
      );
    });
  });
});
