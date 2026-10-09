import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { applyFavoriteToCaches } from '@renderer/components/SongsPage/useSongFavoriteToggle';
import { songQuery } from '@renderer/queries/songs';
import { Route } from '@renderer/routes/main-player/playlists/favorites';
import { invalidateTarget } from '@renderer/hooks/useDataSync';
/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
let mockSearchState: {
  sortingOrder?: string;
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
        if (key === 'playlistsPage.favorites') return 'Favorites';
        if (key === 'common.playAll') return 'Play All';
        if (key === 'common.shuffleAndPlay') return 'Shuffle and Play';
        if (key === 'common.addToQueue') return 'Add to Queue';
        if (key === 'common.songWithCount') return `${opts?.count ?? 0} songs`;
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@renderer/components/VirtualizedList', () => ({
  default: ({
    data,
    itemContent
  }: {
    data: any[];
    itemContent?: (index: number) => React.ReactNode;
  }) => {
    return (
      <div data-testid="virtualized-list">
        {data.map((item, i) => (
          <div key={item ?? i} data-testid="song-item">
            {itemContent ? itemContent(i) : item}
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
  default: () => <div data-testid="playlist-header">Playlist Header</div>
}));

const mockContextValue: Partial<AppUpdateContextType> = {
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  addNewNotifications: vi.fn()
};

describe('Favorites Route - ID-First Windowed Hydration & Invalidation Parity', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.spyOn(Route, 'useSearch').mockImplementation(() => mockSearchState as any);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 5 * 60 * 1000 // 5 minutes standard staleTime
        }
      }
    });

    (window as any).api = {
      properties: { isInDevelopment: false },
      audioLibraryControls: {
        getFilteredSongLibraryIds: vi.fn().mockImplementation((options) => {
          return Promise.resolve({
            ids: [101, 102],
            total: 2,
            blacklistedIds: []
          });
        }),
        getSongInfo: vi.fn().mockResolvedValue([
          { songId: 101, title: 'Favorite Song 101', isAFavorite: true, duration: 180 },
          { songId: 102, title: 'Favorite Song 102', isAFavorite: true, duration: 200 }
        ]),
        getSongListFacets: vi.fn().mockResolvedValue({
          languages: ['English', 'Spanish'],
          genres: ['Rock', 'Pop']
        })
      },
      collections: {
        import: vi.fn().mockResolvedValue(true)
      }
    };
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('renders Favorites page using ID-first query without eager getAllFavoriteSongs', async () => {
    const Component = Route.options.component!;

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
            <Suspense fallback={<div>Loading...</div>}>
              <Component />
            </Suspense>
          </AppUpdateContext.Provider>
        </QueryClientProvider>
      );
    });

    // Confirms ID-first query was invoked with filterType: 'favorites'
    expect((window as any).api.audioLibraryControls.getFilteredSongLibraryIds).toHaveBeenCalledWith(
      expect.objectContaining({
        filterType: 'favorites'
      })
    );

    // Virtuoso list container renders
    expect(screen.getByTestId('virtualized-list')).toBeDefined();
  });

  it('MANDATORY: unfavorite invalidates Favorites IDs immediately without waiting for 5min staleTime', async () => {
    const idsParams = {
      sortType: 'addedOrder' as const,
      filterType: 'favorites' as const
    };

    // 1. Initial query population with 5-minute staleTime
    await queryClient.fetchQuery(songQuery.ids(idsParams));
    const stateBefore = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
    expect(stateBefore?.status).toBe('success');
    expect(stateBefore?.isInvalidated).toBe(false);

    // Initial fetch happened once
    expect((window as any).api.audioLibraryControls.getFilteredSongLibraryIds).toHaveBeenCalledTimes(1);

    // 2. Simulate like mutation event: invalidateTarget('songs:ids:likes')
    // (dispatched both synchronously by useSongFavoriteToggle and reactively by useDataSync)
    act(() => {
      invalidateTarget('songs:ids:likes', queryClient);
    });

    // 3. Assert query was immediately marked invalid / stale
    const stateAfter = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
    expect(stateAfter?.isInvalidated).toBe(true);

    // 4. Assert next fetch occurs immediately rather than honoring 5min staleTime
    // (mocking getFilteredSongLibraryIds returning updated list without song 101)
    (window as any).api.audioLibraryControls.getFilteredSongLibraryIds.mockResolvedValueOnce({
      ids: [102],
      total: 1,
      blacklistedIds: []
    });

    const refreshed = await queryClient.fetchQuery(songQuery.ids(idsParams));
    expect(refreshed.ids).toEqual([102]);
    expect(refreshed.total).toBe(1);
    expect((window as any).api.audioLibraryControls.getFilteredSongLibraryIds).toHaveBeenCalledTimes(2);
  });

  it('MANDATORY: applyFavoriteToCaches flips heart state across all window query prefixes immediately', () => {
    // Prime query caches with different window prefixes (e.g. 'songs', 'queue', 'genre')
    const songWindowKey = ['songs', 'window', 'list1', 1, 0];
    const queueWindowKey = ['queue', 'window', 'list2', 1, 0];
    const genreWindowKey = ['genre', 'window', 'list3', 1, 0];

    queryClient.setQueryData(songWindowKey, [
      { songId: 50, title: 'Song 50', isAFavorite: false }
    ]);
    queryClient.setQueryData(queueWindowKey, [
      { songId: 50, title: 'Song 50', isAFavorite: false }
    ]);
    queryClient.setQueryData(genreWindowKey, [
      { songId: 50, title: 'Song 50', isAFavorite: false }
    ]);

    // Apply favorite toggle to true
    applyFavoriteToCaches(50, true, queryClient);

    expect((queryClient.getQueryData(songWindowKey) as any)[0].isAFavorite).toBe(true);
    expect((queryClient.getQueryData(queueWindowKey) as any)[0].isAFavorite).toBe(true);
    expect((queryClient.getQueryData(genreWindowKey) as any)[0].isAFavorite).toBe(true);

    // Apply favorite toggle back to false (unfavorite)
    applyFavoriteToCaches(50, false, queryClient);

    expect((queryClient.getQueryData(songWindowKey) as any)[0].isAFavorite).toBe(false);
    expect((queryClient.getQueryData(queueWindowKey) as any)[0].isAFavorite).toBe(false);
    expect((queryClient.getQueryData(genreWindowKey) as any)[0].isAFavorite).toBe(false);
  });
});
