/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { Route } from '@renderer/routes/main-player/playlists/history';
import { songCacheKeys, songIdsVersionFromState, songQuery } from '@renderer/queries/songs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
let lastVirtualizedProps: any = null;
let mockSearchState: {
  sortingOrder?: string;
  period?: string;
  mostPlayedLimit?: number;
  language?: string;
} = {};

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any, options?: any) => {
        const opts = typeof defaultValOrOptions === 'object' ? defaultValOrOptions : options;
        if (key === 'playlistsPage.history') return 'History';
        if (key === 'common.playAll') return 'Play All';
        if (key === 'common.shuffleAndPlay') return 'Shuffle and Play';
        if (key === 'common.addToQueue') return 'Add to Queue';
        if (key === 'common.songWithCount') return `${opts?.count ?? 0} songs`;
        if (key === 'historyPage.createPlaylistFromHistory') return 'Create Playlist';
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@renderer/components/VirtualizedList', () => ({
  default: (props: any) => {
    lastVirtualizedProps = props;
    const Header = props.components?.Header;
    return (
      <div data-testid="virtualized-list">
        {Header && <Header />}
        {props.data?.map((entry: any, i: number) => (
          <div key={entry?.songId ?? i} data-testid={`row-${entry?.songId ?? i}`}>
            {props.itemContent ? props.itemContent(i, entry) : entry?.songId}
          </div>
        ))}
      </div>
    );
  }
}));

vi.mock('@renderer/components/SongsPage/Song', () => ({
  default: ({ title, songId }: any) => <div data-testid={`song-${songId}`}>{title}</div>
}));

vi.mock('@renderer/components/SongsPage/SongRowSkeleton', () => ({
  default: ({ index }: any) => <div data-testid={`skeleton-${index}`}>Loading...</div>
}));

vi.mock('@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer', () => ({
  default: ({ filteredCount, totalDuration }: any) => (
    <div data-testid="playlist-header">
      Playlist Header ({filteredCount} songs, {totalDuration}s)
    </div>
  )
}));

const mockContextValue: Partial<AppUpdateContextType> = {
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  addNewNotifications: vi.fn(),
  changePromptMenuData: vi.fn()
};

describe('History Route - ID-First Windowed Hydration & Event Preservation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    lastVirtualizedProps = null;
    mockSearchState = {
      sortingOrder: 'addedOrder',
      period: 'all',
      mostPlayedLimit: 25,
      language: 'all'
    };
    vi.spyOn(Route, 'useSearch').mockImplementation(() => mockSearchState as any);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 5 * 60 * 1000 }
      }
    });

    (window as any).api = {
      properties: { isInDevelopment: false },
      audioLibraryControls: {
        getHistorySongIds: vi.fn().mockResolvedValue({
          entries: [
            { songId: 501, playedAt: 1700000000000, playCount: 5 },
            { songId: 502, playedAt: 1700000001000, playCount: 3 },
            { songId: 503, playedAt: 1700000002000, playCount: 1 }
          ],
          ids: [501, 502, 503],
          total: 3,
          totalDuration: 620,
          blacklistedIds: [503],
          languages: ['English', 'Spanish']
        }),
        getSongInfo: vi.fn().mockImplementation((ids: number[]) => {
          return Promise.resolve(
            ids.map((id) => ({
              songId: id,
              title: `History Track ${id}`,
              duration: 200,
              path: `/music/track-${id}.mp3`,
              artworkPaths: {
                artworkPath: '',
                optimizedArtworkPath: '',
                isDefaultArtwork: true
              },
              isAFavorite: false,
              isBlacklisted: id === 503
            }))
          );
        })
      }
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders history entries using windowed hydration and preserves entry structures', async () => {
    const Component = Route.options.component!;

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
          <Suspense fallback={<div>Loading suspense...</div>}>
            <Component />
          </Suspense>
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    // Initial suspense resolves
    expect(await screen.findByTestId('virtualized-list')).toBeDefined();

    // Verify VirtualizedList received the structured entries, not bare numbers
    expect(lastVirtualizedProps).not.toBeNull();
    expect(lastVirtualizedProps.data).toEqual([
      { songId: 501, playedAt: 1700000000000, playCount: 5 },
      { songId: 502, playedAt: 1700000001000, playCount: 3 },
      { songId: 503, playedAt: 1700000002000, playCount: 1 }
    ]);

    // Fast-resolve query hydration for rendered songs
    expect(await screen.findByTestId('song-501')).toBeDefined();
    expect(await screen.findByTestId('song-502')).toBeDefined();

    // Header receives filteredCount and totalDuration
    expect(screen.getByTestId('playlist-header').textContent).toContain('3 songs, 620s');
  });

  it('route loader prefetches history IDs and Window 0 songInfo when IDs exist', async () => {
    const loader = Route.options.loader!;
    await loader({
      deps: {
        sortingOrder: 'addedOrder',
        period: 'all',
        mostPlayedLimit: 25,
        language: 'all'
      }
    } as any);

    expect(window.api.audioLibraryControls.getHistorySongIds).toHaveBeenCalledWith({
      sortType: 'addedOrder',
      period: 'all',
      limit: 25,
      language: undefined
    });

    expect(window.api.audioLibraryControls.getSongInfo).toHaveBeenCalledWith(
      [501, 502, 503],
      undefined,
      undefined,
      undefined,
      true
    );
  });

  it('route loader skips window 0 prefetch when history IDs result is empty', async () => {
    (window.api.audioLibraryControls.getHistorySongIds as any).mockResolvedValueOnce({
      entries: [],
      ids: [],
      total: 0,
      totalDuration: 0,
      blacklistedIds: [],
      languages: []
    });

    const loader = Route.options.loader!;
    await loader({
      deps: {
        sortingOrder: 'addedOrder',
        period: '7',
        mostPlayedLimit: 10,
        language: 'all'
      }
    } as any);

    expect(window.api.audioLibraryControls.getHistorySongIds).toHaveBeenCalledWith({
      sortType: 'addedOrder',
      period: '7',
      limit: 10,
      language: undefined
    });

    expect(window.api.audioLibraryControls.getSongInfo).not.toHaveBeenCalled();
  });

  it('filters out blacklisted songs from playback queue actions', async () => {
    const Component = Route.options.component!;

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
          <Suspense fallback={<div>Loading suspense...</div>}>
            <Component />
          </Suspense>
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('virtualized-list')).toBeDefined();

    // Trigger Play All button
    const playAllBtn = screen.getByTitle('Play All');
    act(() => {
      playAllBtn.click();
    });

    // Song 503 is blacklisted, so only [501, 502] should be queued
    expect(mockContextValue.createQueue).toHaveBeenCalledWith(
      [501, 502],
      'songs',
      false,
      'history',
      true,
      'History'
    );
  });
});
