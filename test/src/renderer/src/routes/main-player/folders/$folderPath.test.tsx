/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { Route } from '@renderer/routes/main-player/folders/$folderPath';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
let lastVirtualizedProps: any = null;

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
        if (key === 'common.songWithCount') return `${opts?.count ?? 0} songs`;
        if (key === 'common.playAll') return 'Play All';
        if (key === 'common.shuffleAndPlay') return 'Shuffle and Play';
        if (key === 'common.addToQueue') return 'Add to Queue';
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@renderer/components/VirtualizedList', () => ({
  default: (props: any) => {
    lastVirtualizedProps = props;
    return (
      <div data-testid="virtualized-list">
        {props.data?.map((id: number, i: number) => (
          <div key={id} data-testid={`row-${id}`}>
            {props.itemContent ? props.itemContent(i) : id}
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

const mockContextValue: Partial<AppUpdateContextType> = {
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  addNewNotifications: vi.fn()
};

describe('Folder Route - ID-First Windowed Wiring Test', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    lastVirtualizedProps = null;
    vi.spyOn(Route, 'useParams').mockReturnValue({ folderPath: 'C:\\Music\\Rock' } as any);
    vi.spyOn(Route, 'useSearch').mockReturnValue({ sortingOrder: 'aToZ', filteringOrder: 'notSelected' } as any);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 5 * 60 * 1000 }
      }
    });

    (window as any).api = {
      folderData: {
        getFolderData: vi.fn().mockResolvedValue([
          {
            path: 'C:\\Music\\Rock',
            songIds: [301, 302],
            subFolders: []
          }
        ])
      },
      audioLibraryControls: {
        getFilteredSongLibraryIds: vi.fn().mockResolvedValue({
          ids: [301, 302],
          total: 2,
          blacklistedIds: []
        }),
        getSongInfo: vi.fn().mockResolvedValue([
          { songId: 301, title: 'Folder Song 1', duration: 180 },
          { songId: 302, title: 'Folder Song 2', duration: 210 }
        ])
      }
    };
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('invokes songQuery.ids with restrictToIds: folderSongIds and feeds ids array to VirtualizedList', async () => {
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

    // 1. Verifies folder data was queried
    expect((window as any).api.folderData.getFolderData).toHaveBeenCalledWith(['C:\\Music\\Rock']);

    // 2. Verifies songQuery.ids was called with expected restrictToIds and sortingOrder
    expect((window as any).api.audioLibraryControls.getFilteredSongLibraryIds).toHaveBeenCalledWith(
      expect.objectContaining({
        restrictToIds: [301, 302],
        sortType: 'aToZ',
        filterType: 'notSelected'
      })
    );

    // 3. Verifies VirtualizedList was mounted and fed the exact ID array
    expect(screen.getByTestId('virtualized-list')).toBeDefined();
    expect(lastVirtualizedProps).not.toBeNull();
    expect(lastVirtualizedProps.data).toEqual([301, 302]);
  });
});
