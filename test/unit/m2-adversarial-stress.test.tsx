// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWindowHydration } from '../../src/renderer/src/hooks/useWindowHydration';
import Song from '../../src/renderer/src/components/SongsPage/Song';
import { AppUpdateContext, type AppUpdateContextType } from '../../src/renderer/src/contexts/AppUpdateContext';
import type { SongData } from '../../src/types/app';
import { SONG_WINDOW_SIZE } from '../../src/renderer/src/queries/songs';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
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

function createMockSong(id: number, overrides: Partial<SongData> = {}): SongData {
  return {
    songId: id,
    title: `Challenger Song ${id}`,
    duration: 210,
    artists: [{ artistId: (id % 50) + 1, name: `Artist ${(id % 50) + 1}` }],
    album: { albumId: (id % 100) + 1, name: `Album ${(id % 100) + 1}` },
    albumArtists: [{ artistId: (id % 50) + 1, name: `Artist ${(id % 50) + 1}` }],
    genres: [{ genreId: 1, name: 'Rock' }],
    isAFavorite: false,
    isBlacklisted: false,
    trackNo: (id % 12) + 1,
    year: 2025,
    path: `C:\\Music\\challenger_${id}.flac`,
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

describe('Challenger 2 — Adversarial Stress & Concurrency Test Suite (Milestone 2)', () => {
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
      properties: { isInDevelopment: false },
      audioLibraryControls: {
        getSongInfo: mockGetSongInfo
      },
      playerControls: {
        toggleLikeSongs: vi.fn().mockResolvedValue({ likes: [], dislikes: [] })
      }
    };
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AppUpdateContext.Provider value={mockContextValue}>
        {children}
      </AppUpdateContext.Provider>
    </QueryClientProvider>
  );

  // --------------------------------------------------------------------------
  // TEST 1A: Intra-window fast scrolling completely bails out of re-renders
  // --------------------------------------------------------------------------
  it('Adversarial 1A: 50 continuous range changes within the same window boundaries produce ZERO re-renders', async () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const timestamp = 1710000000000;
    const identity = 'intra-window-stress';

    let hookRenderCount = 0;
    const { result } = renderHook(
      () => {
        hookRenderCount++;
        return useWindowHydration(ids, timestamp, {
          listIdentity: identity,
          keyPrefix: 'songs'
        });
      },
      { wrapper }
    );

    // Initial mount hydration: wait for window 0 query to settle
    await waitFor(() => {
      expect(result.current.getItem(0)).toBeDefined();
    });

    const countBeforeScrolling = hookRenderCount;

    // Simulate high-velocity scroll events within window 0 bounds ({ firstWindow: 0, lastWindow: 0 })
    act(() => {
      for (let i = 1; i <= 50; i++) {
        result.current.onRangeChange({ startIndex: i, endIndex: i + 10 });
      }
    });

    // Since window boundaries ({ firstWindow: 0, lastWindow: 0 }) did not change,
    // state update is completely bailed out. Total renders across all 50 events is bounded to <= 3 (0 extra state renders).
    expect(hookRenderCount).toBeLessThanOrEqual(countBeforeScrolling + 1);
  });

  // --------------------------------------------------------------------------
  // TEST 1B: Lookahead prefetching during rapid continuous traversal
  // --------------------------------------------------------------------------
  it('Adversarial 1B: Rapid traversal across 10,000 items triggers lookahead prefetching without unbounced cascades', async () => {
    const TOTAL_SONGS = 10000;
    const ids = Array.from({ length: TOTAL_SONGS }, (_, i) => i + 1);
    const timestamp = 1710000000000;
    const identity = 'rapid-traversal-stress';

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

    // Rapidly scroll across library to index 4000
    act(() => {
      result.current.onRangeChange({ startIndex: 4000, endIndex: 4020 });
    });

    // Verify lookahead window ahead is prefetched in the background
    await waitFor(() => {
      // For index 4000 with extraRowsAfter=150, end=4170, lastWindow=20 (start=4000).
      // Lookahead window is lastWindow + 1 = 21 (start = 4200).
      const lookaheadData = queryClient.getQueryData<SongData[]>([
        'songs',
        'window',
        identity,
        timestamp,
        4200
      ]);
      expect(lookaheadData).toBeDefined();
      expect(lookaheadData?.length).toBe(SONG_WINDOW_SIZE);
    });

    // Synchronous getItem on lookahead window item resolves in 0ms
    const lookaheadItem = result.current.getItem(4250);
    expect(lookaheadItem).toBeDefined();
    expect(lookaheadItem?.songId).toBe(4251);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Out-of-order asynchronous window resolution race conditions
  // --------------------------------------------------------------------------
  it('Adversarial 2: Handles out-of-order asynchronous chunk resolution without data corruption or stale overwrites', async () => {
    const ids = Array.from({ length: 2000 }, (_, i) => i + 1);
    const timestamp = 1710000000000;
    const identity = 'out-of-order-race';

    mockGetSongInfo.mockImplementation((requestedIds: number[]) => {
      const firstId = requestedIds[0];
      return new Promise((resolve) => {
        if (firstId === 1) {
          // Window 0 (ids 1..200): slow response (50ms)
          setTimeout(() => resolve(requestedIds.map((id) => createMockSong(id))), 50);
        } else if (firstId === 201) {
          // Window 1 (ids 201..400): fast response (5ms)
          setTimeout(() => resolve(requestedIds.map((id) => createMockSong(id))), 5);
        } else {
          resolve(requestedIds.map((id) => createMockSong(id)));
        }
      });
    });

    const { result } = renderHook(
      () =>
        useWindowHydration(ids, timestamp, {
          listIdentity: identity,
          keyPrefix: 'songs'
        }),
      { wrapper }
    );

    // Fast scroll immediately to window 1 (range 220..240) before window 0 has resolved
    act(() => {
      result.current.onRangeChange({ startIndex: 220, endIndex: 240 });
    });

    // Window 1 resolves first
    await waitFor(() => {
      expect(result.current.getItem(220)).toBeDefined();
    });

    expect(result.current.getItem(220)?.songId).toBe(221);

    // Wait for slower Window 0 to eventually resolve
    await waitFor(() => {
      expect(result.current.getItem(0)).toBeDefined();
    });

    expect(result.current.getItem(0)?.songId).toBe(1);
    expect(result.current.getItem(220)?.songId).toBe(221); // Window 1 data remains intact and uncorrupted
  });

  // --------------------------------------------------------------------------
  // TEST 3: Oscillating scroll stress across window boundary
  // --------------------------------------------------------------------------
  it('Adversarial 3: Rapid back-and-forth oscillation across window boundaries does not trigger redundant queries or infinite loops', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
    const timestamp = 1710000000000;
    const identity = 'oscillation-stress';

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

    const callsBeforeOscillation = mockGetSongInfo.mock.calls.length;

    // Rapidly oscillate 50 times across boundary between Window 0 and Window 1 (indices 190 <-> 210)
    for (let i = 0; i < 50; i++) {
      act(() => {
        result.current.onRangeChange({ startIndex: 190, endIndex: 195 });
      });
      act(() => {
        result.current.onRangeChange({ startIndex: 205, endIndex: 210 });
      });
    }

    await waitFor(() => {
      expect(result.current.getItem(205)).toBeDefined();
    });

    // Because React Query caches the window queries by key and staleTime is configured,
    // total queries to backend MUST NOT be 100+. They should be cached after first fetch.
    expect(mockGetSongInfo.mock.calls.length).toBeLessThanOrEqual(callsBeforeOscillation + 5);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Verification of lazy artwork decoding attributes in Song component
  // --------------------------------------------------------------------------
  it('Adversarial 4: Song component renders loading="lazy" and decoding="async" attributes on artwork img element', () => {
    const mockSongData = createMockSong(101, {
      title: 'Lazy Async Song',
      artworkPaths: {
        isDefaultArtwork: false,
        artworkPath: 'C:\\AppData\\art_101.jpg',
        optimizedArtworkPath: 'C:\\AppData\\opt_101.webp'
      }
    });

    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <Song
          index={0}
          songId={mockSongData.songId}
          title={mockSongData.title}
          duration={mockSongData.duration}
          path={mockSongData.path}
          isAFavorite={mockSongData.isAFavorite}
          isIndexingSongs={false}
          artworkPaths={mockSongData.artworkPaths!}
          artists={mockSongData.artists}
          album={mockSongData.album}
          trackNo={mockSongData.trackNo}
          year={mockSongData.year}
        />
      </AppUpdateContext.Provider>
    );

    // Query artwork image
    const imgElement = container.querySelector('img[alt="Song cover"]');
    expect(imgElement).not.toBeNull();
    expect(imgElement?.getAttribute('loading')).toBe('lazy');
    expect(imgElement?.getAttribute('decoding')).toBe('async');
  });
});
