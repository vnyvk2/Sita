/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import '@renderer/store/store';
import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { CollectionEventProvider } from '@renderer/components/providers/CollectionEventProvider';
import { Route } from '@renderer/routes/main-player/playlists/$playlistId';
import { collectionKeys } from '@renderer/api/collectionKeys';
import { SONG_WINDOW_SIZE } from '@renderer/queries/songs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
let lastVirtualizedProps: any = null;
let lastDragDropContextProps: any = null;
let registeredCollectionEventListener: ((e: unknown, event: any) => void) | null = null;
let mockSearchState: {
  sortingOrder?: string;
  filteringOrder?: string;
  language?: string;
  keyword?: string;
} = {};

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, ...props }: any) => {
    lastDragDropContextProps = props;
    return <div data-testid="drag-drop-context">{children}</div>;
  },
  Droppable: ({ children }: any) =>
    children(
      {
        droppableProps: {},
        innerRef: () => {},
        placeholder: null
      },
      {}
    ),
  Draggable: ({ children }: any) =>
    children(
      {
        draggableProps: {},
        dragHandleProps: {},
        innerRef: () => {}
      },
      {}
    )
}));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any, options?: any) => {
        const opts = typeof defaultValOrOptions === 'object' ? defaultValOrOptions : options;
        if (key === 'playlistsPage.playlist') return 'Playlist';
        if (key === 'common.playAll') return 'Play All';
        if (key === 'common.shuffleAndPlay') return 'Shuffle and Play';
        if (key === 'common.songWithCount') return `${opts?.count ?? 0} songs`;
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
      <div ref={props.scrollerRef} data-testid="virtualized-list">
        {Header && <Header context={props.context} />}
        {props.data?.map((entry: any, i: number) => (
          <div key={entry?.entryId ?? i} data-testid={`row-${entry?.entryId ?? i}`}>
            {props.itemContent ? props.itemContent(i, entry, props.context) : entry?.songId}
          </div>
        ))}
      </div>
    );
  }
}));

vi.mock('@renderer/components/SongsPage/Song', () => ({
  default: ({ title, songId, entryId }: any) => (
    <div data-testid={`song-${songId}`} data-entry-id={entryId}>
      {title}
    </div>
  )
}));

vi.mock('@renderer/components/SongsPage/SongRowSkeleton', () => ({
  default: ({ index }: any) => <div data-testid={`skeleton-${index}`}>Loading...</div>
}));

vi.mock('@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer', () => ({
  default: ({ playlist, filteredCount, totalDuration }: any) => (
    <div data-testid="playlist-header">
      {playlist?.name} ({filteredCount ?? playlist?.itemCount} songs, {totalDuration}s)
    </div>
  )
}));

const mockContextValue: Partial<AppUpdateContextType> = {
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  addNewNotifications: vi.fn()
};

describe('Playlist Detail Route ($playlistId) - Catalog-Driven Windowed Hydration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    lastVirtualizedProps = null;
    lastDragDropContextProps = null;
    registeredCollectionEventListener = null;
    mockSearchState = {
      sortingOrder: 'customOrder',
      language: 'all'
    };
    vi.spyOn(Route, 'useSearch').mockImplementation(() => mockSearchState as any);
    vi.spyOn(Route, 'useParams').mockImplementation((opts?: any) => {
      const raw = { playlistId: '42' };
      return opts?.select ? opts.select(raw) : (raw as any);
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 5 * 60 * 1000 }
      }
    });

    (window as any).api = {
      properties: { isInDevelopment: false },
      collections: {
        read: {
          getCollection: vi.fn().mockResolvedValue({
            id: 42,
            name: 'Heavy Rotation',
            playlistType: 'custom',
            itemCount: 2,
            totalDuration: 450,
            artworkPaths: {
              artworkPath: '',
              optimizedArtworkPath: '',
              isDefaultArtwork: true
            }
          }),
          getPlaylistSongCatalog: vi.fn().mockResolvedValue({
            entries: [
              { entryId: 101, songId: 701 },
              { entryId: 102, songId: 702 }
            ],
            total: 2,
            totalDuration: 450,
            blacklistedIds: [],
            languages: ['English', 'German']
          })
        },
        write: {
          reorder: vi.fn().mockResolvedValue(true)
        },
        events: {
          onEvent: vi.fn().mockImplementation((cb) => {
            registeredCollectionEventListener = cb;
          }),
          offEvent: vi.fn()
        }
      },
      audioLibraryControls: {
        getSongInfo: vi.fn().mockImplementation((ids: number[]) => {
          return Promise.resolve(
            ids.map((id) => ({
              songId: id,
              title: `Catalog Song ${id}`,
              duration: 225,
              path: `/music/song-${id}.mp3`,
              artworkPaths: {
                artworkPath: '',
                optimizedArtworkPath: '',
                isDefaultArtwork: true
              },
              isAFavorite: false
            }))
          );
        })
      },
      messages: {
        getMessageFromMain: vi.fn(),
        removeMessageToRendererEventListener: vi.fn()
      }
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders playlist songs using catalog-driven windowed hydration and preserves entryId', async () => {
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

    // Verify VirtualizedList received catalog entries with entryId
    expect(lastVirtualizedProps).not.toBeNull();
    expect(lastVirtualizedProps.data).toEqual([
      { entryId: 101, songId: 701 },
      { entryId: 102, songId: 702 }
    ]);

    // Fast-resolve query hydration for rendered songs
    expect(await screen.findByTestId('song-701')).toBeDefined();
    expect(await screen.findByTestId('song-702')).toBeDefined();

    // Header receives playlist name, filteredCount and totalDuration
    expect(screen.getByTestId('playlist-header').textContent).toContain(
      'Heavy Rotation (2 songs, 450s)'
    );
  });

  it('route loader prefetches playlist detail, catalog, and window 0 song info using SONG_WINDOW_SIZE', async () => {
    const loader = Route.options.loader!;
    await loader({
      params: { playlistId: '42' },
      deps: {
        sortingOrder: 'customOrder',
        language: 'all'
      }
    } as any);

    expect(window.api.collections.read.getCollection).toHaveBeenCalledWith(42);
    expect(window.api.collections.read.getPlaylistSongCatalog).toHaveBeenCalledWith(42, {
      sortType: 'customOrder',
      filterType: undefined,
      language: undefined,
      keyword: undefined
    });
    // With 2 entries, it requests all 2 (which is min(SONG_WINDOW_SIZE, entries.length))
    expect(window.api.audioLibraryControls.getSongInfo).toHaveBeenCalledWith(
      [701, 702],
      undefined,
      undefined,
      undefined,
      true
    );
    expect(SONG_WINDOW_SIZE).toBe(200);
  });

  it('binds URL search keyword to catalog query options and query key', async () => {
    mockSearchState = {
      sortingOrder: 'customOrder',
      language: 'all',
      keyword: 'electric'
    };

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
    expect(window.api.collections.read.getPlaylistSongCatalog).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        keyword: 'electric'
      })
    );
  });

  it('emits drag-and-drop reorder operation with correct entryId and targetPosition', async () => {
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
    expect(lastDragDropContextProps).not.toBeNull();

    // Trigger drag-and-drop reorder: move entry 101 from index 0 to destination index 1
    await act(async () => {
      lastDragDropContextProps.onDragEnd({
        reason: 'DROP',
        source: { index: 0 },
        destination: { index: 1 },
        draggableId: '101'
      });
    });

    expect(window.api.collections.write.reorder).toHaveBeenCalledWith({
      playlistId: 42,
      entryId: 101,
      newPosition: 1
    });
  });

  it('invalidates catalog cache when CollectionChanged event is received', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <CollectionEventProvider>
          <div>Event listener child</div>
        </CollectionEventProvider>
      </QueryClientProvider>
    );

    expect(registeredCollectionEventListener).not.toBeNull();

    act(() => {
      registeredCollectionEventListener!(null, {
        type: 'CollectionChanged',
        payload: { collectionId: 42, action: 'reorder' }
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: collectionKeys.catalogRoot(42)
    });
  });

  it('removes catalog cache when CollectionDeleted event is received', async () => {
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <CollectionEventProvider>
          <div>Event listener child</div>
        </CollectionEventProvider>
      </QueryClientProvider>
    );

    expect(registeredCollectionEventListener).not.toBeNull();

    act(() => {
      registeredCollectionEventListener!(null, {
        type: 'CollectionDeleted',
        payload: { collectionIds: [42] }
      });
    });

    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: collectionKeys.catalogRoot(42)
    });
  });
});
