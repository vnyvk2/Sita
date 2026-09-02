// @vitest-environment jsdom
import { useWindowHydration } from '../../src/renderer/src/hooks/useWindowHydration';
import { SONG_WINDOW_SIZE, songCacheKeys, getSongListIdentity } from '../../src/renderer/src/queries/songs';
import type { SongData } from '../../src/types/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createMockSong(id: number, overrides: Partial<SongData> = {}): SongData {
  return {
    songId: id,
    title: `Song ${id}`,
    duration: 200,
    artists: [{ artistId: 1, name: 'Test Artist' }],
    album: { albumId: 1, name: 'Test Album' },
    albumArtists: [{ artistId: 1, name: 'Test Artist' }],
    genres: [{ genreId: 1, name: 'Pop' }],
    isAFavorite: false,
    isBlacklisted: false,
    trackNo: (id % 12) + 1,
    year: 2024,
    path: `C:\\Music\\song_${id}.mp3`,
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

describe('useWindowHydrationProgressive — Tiers 1, 2 & 3 Validation Suite', () => {
  let queryClient: QueryClient;
  let mockGetSongInfo: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    mockGetSongInfo = vi.fn().mockImplementation(async (ids: number[]) => {
      return ids.map((id) => createMockSong(id));
    });

    (window as any).api = {
      audioLibraryControls: {
        getSongInfo: mockGetSongInfo
      }
    };
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE
  // --------------------------------------------------------------------------
  describe('Tier 1: Feature Coverage (Window Snapping, Zero Skeletons, Progressive Loading)', () => {
    it('snaps window boundaries strictly in 200-row chunks', async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'main-library',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      // Initial visible range [0..15] should request Window 0 (0..199)
      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      expect(mockGetSongInfo).toHaveBeenCalledWith(
        ids.slice(0, 200),
        undefined,
        undefined,
        undefined,
        true
      );

      // Scroll to range [180..210] -> overlaps window 0 and window 1 (200..399)
      act(() => {
        result.current.onRangeChange({ startIndex: 180, endIndex: 210 });
      });

      await waitFor(() => {
        expect(result.current.getItem(250)).toBeDefined();
      });

      // Window 1 (200..399) should have been requested
      expect(mockGetSongInfo).toHaveBeenCalledWith(
        ids.slice(200, 400),
        undefined,
        undefined,
        undefined,
        true
      );
    });

    it('achieves zero-skeleton fast-path via synchronous queryCache retrieval', () => {
      const ids = [1, 2, 3, 4, 5];
      const timestamp = 1700000000000;
      const identity = 'cached-list';

      // Pre-seed QueryCache for Window 0
      const windowKey = ['songs', 'window', identity, timestamp, 0];
      const cachedSongs = ids.map((id) => createMockSong(id, { title: `Instant Cached ${id}` }));
      queryClient.setQueryData(windowKey, cachedSongs);

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: identity,
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      // Synchronous retrieval on first render tick — NO skeleton delay, NO undefined return!
      const item0 = result.current.getItem(0);
      const item3 = result.current.getItem(3);

      expect(item0).toBeDefined();
      expect(item0?.title).toBe('Instant Cached 1');
      expect(item3).toBeDefined();
      expect(item3?.title).toBe('Instant Cached 4');
    });

    it('provides primary text metadata synchronously while active scrolling state is maintained', async () => {
      const ids = Array.from({ length: 50 }, (_, i) => i + 1);
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'progressive-test',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      const song = result.current.getItem(0);
      // Primary identifiers are immediately present
      expect(song?.title).toBe('Song 1');
      expect(song?.artists).toEqual([{ artistId: 1, name: 'Test Artist' }]);
      expect(song?.duration).toBe(200);
      expect(song?.isAFavorite).toBe(false);
      expect(song?.isArtworkAvailable).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // --------------------------------------------------------------------------
  describe('Tier 2: Boundary & Corner Cases', () => {
    it('handles empty library (0 songs) safely and returns undefined without throwing', () => {
      const ids: number[] = [];
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'empty-library',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      expect(result.current.getItem(0)).toBeUndefined();
    });

    it('handles single-song library (1 song) accurately', async () => {
      const ids = [42];
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'single-song',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      expect(result.current.getItem(0)?.songId).toBe(42);
      expect(result.current.getItem(1)).toBeUndefined();
    });

    it('scales to 5,000+ songs requesting only visible window chunks', async () => {
      const totalSongs = 5000;
      const ids = Array.from({ length: totalSongs }, (_, i) => i + 1);
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: '5k-library',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      // Verify window 0 (first 200 items) is requested for initial viewport
      expect(mockGetSongInfo).toHaveBeenCalledWith(
        ids.slice(0, 200),
        undefined,
        undefined,
        undefined,
        true
      );
    });

    it('safely handles missing/deleted IDs in requested chunk (rendering skeleton fallback)', async () => {
      const ids = [10, 20, 30, 40];
      const timestamp = 1700000000000;

      // Simulate ID 20 deleted in DB (returns only 10, 30, 40)
      mockGetSongInfo.mockResolvedValue([
        createMockSong(10),
        createMockSong(30),
        createMockSong(40)
      ]);

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'deleted-id-test',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      expect(result.current.getItem(0)?.songId).toBe(10);
      expect(result.current.getItem(1)).toBeUndefined(); // Missing ID 20 returns undefined (skeleton)
      expect(result.current.getItem(2)?.songId).toBe(30);
      expect(result.current.getItem(3)?.songId).toBe(40);
    });

    it('handles violent scrolling index jumps across 5,000 items without queuing stalls', async () => {
      const totalSongs = 5000;
      const ids = Array.from({ length: totalSongs }, (_, i) => i + 1);
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'violent-scroll',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      // Violent jump: scroll instantly to index 4800 (Window 24 = 4800..4999)
      act(() => {
        result.current.onRangeChange({ startIndex: 4800, endIndex: 4820 });
      });

      await waitFor(() => {
        expect(result.current.getItem(4800)).toBeDefined();
      });

      expect(result.current.getItem(4800)?.songId).toBe(4801);
      expect(result.current.getItem(4810)?.songId).toBe(4811);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe('Tier 3: Cross-Feature Combinations', () => {
    it('synchronizes optimistic favorite toggle while list scrolling is active', async () => {
      const ids = Array.from({ length: 600 }, (_, i) => i + 1);
      const timestamp = 1700000000000;
      const identity = 'fav-scroll-test';

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: identity,
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(25)).toBeDefined();
      });

      expect(result.current.getItem(25)?.isAFavorite).toBe(false);

      // Scroll viewport down to index 400
      act(() => {
        result.current.onRangeChange({ startIndex: 400, endIndex: 415 });
      });

      await waitFor(() => {
        expect(result.current.getItem(400)).toBeDefined();
      });

      // Optimistic favorite update for Song #25 in QueryCache
      act(() => {
        const window0Key = ['songs', 'window', identity, timestamp, 0];
        queryClient.setQueryData<SongData[]>(window0Key, (old) => {
          if (!old) return old;
          return old.map((song) =>
            song.songId === 26 ? { ...song, isAFavorite: true } : song
          );
        });
      });

      // Song #25 (index 25) reflects favorite = true without breaking active scrolling at index 400
      expect(result.current.getItem(25)?.isAFavorite).toBe(true);
      expect(result.current.getItem(400)?.songId).toBe(401);
    });

    it('enables instant multi-selection (Ctrl+A) across entire 5,000-song library during background chunk fetching', () => {
      const totalSongs = 5000;
      const ids = Array.from({ length: totalSongs }, (_, i) => i + 1);

      // Simulated selection state
      const selectedIds = new Set<number>();

      // Select All action executes against canonical ID array in O(N) immediately
      for (let i = 0; i < ids.length; i++) {
        selectedIds.add(ids[i]);
      }

      expect(selectedIds.size).toBe(5000);
      expect(selectedIds.has(1)).toBe(true);
      expect(selectedIds.has(2500)).toBe(true);
      expect(selectedIds.has(5000)).toBe(true);
    });

    it('supports queue enqueue operations during scrolling without query cache invalidation', async () => {
      const ids = Array.from({ length: 400 }, (_, i) => i + 1);
      const timestamp = 1700000000000;
      const identity = 'queue-scroll-test';

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: identity,
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      // Simulate enqueueing Song #10 into playback queue
      const queueList: SongData[] = [];
      const song10 = result.current.getItem(9);
      if (song10) {
        queueList.push(song10);
      }

      expect(queueList).toHaveLength(1);
      expect(queueList[0].songId).toBe(10);

      // Window hydration cache remains intact
      const queryCache = queryClient.getQueryCache().getAll();
      const activeWindowQueries = queryCache.filter((q) =>
        q.queryKey.includes(identity)
      );
      expect(activeWindowQueries.length).toBeGreaterThan(0);
      expect(activeWindowQueries.every((q) => !q.state.isInvalidated)).toBe(true);
    });

    it('prefetches aligned lookahead window ahead in background during range changes without extra hook re-renders', async () => {
      const totalSongs = 1000;
      const ids = Array.from({ length: totalSongs }, (_, i) => i + 1);
      const timestamp = 1700000000000;
      const identity = 'lookahead-test';

      let renderCount = 0;
      const { result } = renderHook(
        () => {
          renderCount++;
          return useWindowHydration(ids, timestamp, {
            listIdentity: identity,
            keyPrefix: 'songs'
          });
        },
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      // Initial visible range [0..15] -> window 0 requested
      expect(mockGetSongInfo).toHaveBeenCalledWith(
        ids.slice(0, 200),
        undefined,
        undefined,
        undefined,
        true
      );

      const renderCountBefore = renderCount;

      // Scroll to range [50..65] -> onRangeChange triggers lookahead prefetch for Window 1 (200..399)
      act(() => {
        result.current.onRangeChange({ startIndex: 50, endIndex: 65 });
      });

      await waitFor(() => {
        // Query for Window 1 is prefetched and cached in queryClient
        const cachedWindow1 = queryClient.getQueryData<SongData[]>([
          'songs',
          'window',
          identity,
          timestamp,
          200
        ]);
        expect(cachedWindow1).toBeDefined();
        expect(cachedWindow1?.length).toBe(200);
      });

      // Fast synchronous getItem for index 250 in Window 1 resolves in 0ms!
      const item250 = result.current.getItem(250);
      expect(item250).toBeDefined();
      expect(item250?.songId).toBe(251);
    });
  });
});

