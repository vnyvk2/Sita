// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../contexts/AppUpdateContext';
import SearchContainer from '../SearchContainer';

// Polyfill ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

const mockGetQueuesManager = vi.fn();
vi.mock('@renderer/other/queuesManager', () => ({
  getQueuesManager: () => mockGetQueuesManager()
}));

const MOCK_SEARCH_RESULTS: SearchResult = {
  songs: [
    {
      songId: 1,
      title: 'One More Time',
      artists: [{ name: 'Daft Punk', artistId: 11 }],
      duration: 320,
      artworkPaths: { artworkPath: '/art1.png' },
      isBlacklisted: false
    },
    {
      songId: 2,
      title: 'Digital Love',
      artists: [{ name: 'Daft Punk', artistId: 11 }],
      duration: 300,
      artworkPaths: { artworkPath: '/art2.png' },
      isBlacklisted: false
    }
  ] as SongData[],
  artists: [
    {
      artistId: 11,
      name: 'Daft Punk',
      songs: [
        { title: 'One More Time', songId: 1 },
        { title: 'Digital Love', songId: 2 },
        { title: 'Blacklisted Track', songId: 99 }
      ],
      isAFavorite: false,
      artworkPaths: { artworkPath: '/artist.png' }
    }
  ] as Artist[],
  albums: [
    {
      albumId: 21,
      title: 'Discovery',
      songs: [
        { title: 'One More Time', songId: 1 },
        { title: 'Digital Love', songId: 2 }
      ],
      artists: [{ name: 'Daft Punk', artistId: 11 }],
      artworkPaths: { artworkPath: '/album.png' }
    }
  ] as Album[],
  playlists: [],
  genres: [],
  availableResults: [],
  confidence: { songs: 0, artists: 0, albums: 0, playlists: 0, genres: 0 }
};

let mockQueryData: SearchResult | null;
const mockFetchQuery = vi.fn();

vi.mock('@renderer/queries/search', () => ({
  searchQuery: {
    query: (data: { keyword: string; filter: string }) => ({
      queryKey: ['search-mock', data.keyword, data.filter],
      queryFn: () => Promise.resolve(MOCK_SEARCH_RESULTS)
    })
  }
}));

vi.mock('@renderer/queries/songs', () => ({
  songQuery: {
    queue: (data: { songIds: number[] }) => ({
      queryKey: ['queue-mock', data.songIds],
      queryFn: () => Promise.resolve([])
    })
  }
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({ data: mockQueryData, isFetching: false }),
    useQueryClient: () => ({ fetchQuery: mockFetchQuery })
  };
});

// Render VirtualizedList contents synchronously so rows are clickable in jsdom.
// Also invokes itemContent one index past the end (undefined item), mirroring the
// stale-range race real Virtuoso exhibits while the result set shrinks mid-typing
vi.mock('../../../VirtualizedList', () => ({
  default: ({
    data,
    itemContent
  }: {
    data: unknown[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    itemContent: (index: number, item: any) => ReactNode;
  }) => (
    <div>
      {data.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
      <div data-testid="virtuoso-stale-index">{itemContent(data.length, undefined)}</div>
    </div>
  )
}));

vi.mock('../../../Img', () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt} />
}));

describe('MiniPlayer SearchContainer', () => {
  const mockContextValue: AppUpdateContextType = {
    playSong: vi.fn(),
    updateQueueData: vi.fn(),
    createQueue: vi.fn(),
    addNewNotifications: vi.fn()
  } as unknown as AppUpdateContextType;

  const mockOnClose = vi.fn();

  const renderContainer = () =>
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <SearchContainer isSearchVisible onClose={mockOnClose} />
      </AppUpdateContext.Provider>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryData = MOCK_SEARCH_RESULTS;
    // Hydrated SongData as the real songQuery.queue would return (99 = blacklisted)
    mockFetchQuery.mockResolvedValue([
      { songId: 1, isBlacklisted: false },
      { songId: 2, isBlacklisted: false },
      { songId: 99, isBlacklisted: true }
    ]);
    mockGetQueuesManager.mockReturnValue({
      getActiveQueue: () => ({
        id: 'active-queue',
        addSongIdToEnd: vi.fn()
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const typeQuery = async (keyword: string) => {
    const input = screen.getByPlaceholderText('Search songs, artists, albums…');
    fireEvent.change(input, { target: { value: keyword } });
    // Poll past the component's 250ms debounce window instead of a fixed sleep so the
    // suite stays deterministic under heavy CPU contention (parallel workers)
    await waitFor(
      () => {
        expect(screen.queryByText('Type to search your library')).toBeNull();
      },
      { timeout: 3000 }
    );
  };

  it('shows the empty-library hint before a keyword is typed', () => {
    renderContainer();
    expect(screen.getByText('Type to search your library')).toBeDefined();
    expect(screen.queryByText('One More Time')).toBeNull();
  });

  it('renders song, artist and album sections after a debounced query', async () => {
    renderContainer();
    await typeQuery('daft');

    await waitFor(() => {
      expect(screen.getByText('One More Time')).toBeDefined();
    });
    expect(screen.getByText('Digital Love')).toBeDefined();
    expect(screen.getByText('Discovery')).toBeDefined();
  });

  it('creates a fresh Search Results queue and plays the clicked song, then collapses', async () => {
    renderContainer();
    await typeQuery('daft');

    const songRow = await screen.findByTestId('mini-search-song-2', undefined, { timeout: 3000 });
    fireEvent.click(songRow);

    expect(mockContextValue.createQueue).toHaveBeenCalledWith(
      [1, 2],
      'songs',
      false,
      undefined,
      false,
      'Search Results'
    );
    expect(mockContextValue.updateQueueData).toHaveBeenCalledWith(1, undefined, false, true);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('adds a song to the active queue via the + action without playing or collapsing', async () => {
    const addSongIdToEnd = vi.fn();
    mockGetQueuesManager.mockReturnValue({
      getActiveQueue: () => ({ id: 'active-queue', addSongIdToEnd })
    });

    renderContainer();
    await typeQuery('daft');

    await waitFor(
      () => {
        expect(screen.getAllByTitle('Add to queue')).toHaveLength(2);
      },
      { timeout: 3000 }
    );
    const addButtons = screen.getAllByTitle('Add to queue');
    fireEvent.click(addButtons[0]);

    expect(addSongIdToEnd).toHaveBeenCalledWith(1);
    expect(mockContextValue.createQueue).not.toHaveBeenCalled();
    expect(mockContextValue.updateQueueData).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(mockContextValue.addNewNotifications).toHaveBeenCalledTimes(1);
  });

  it('starts playing an artist entity queue on artist row click, excluding blacklisted songs', async () => {
    renderContainer();
    await typeQuery('daft');

    fireEvent.click(
      await screen.findByTestId('mini-search-artist-11', undefined, { timeout: 3000 })
    );

    // Hydration fetch resolves blacklist flags; song 99 must be filtered out
    await waitFor(() => {
      expect(mockContextValue.createQueue).toHaveBeenCalledWith(
        [1, 2],
        'artist',
        false,
        11,
        true,
        'Daft Punk'
      );
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('starts playing an album entity queue on album row click', async () => {
    renderContainer();
    await typeQuery('daft');

    fireEvent.click(
      await screen.findByTestId('mini-search-album-21', undefined, { timeout: 3000 })
    );

    await waitFor(() => {
      expect(mockContextValue.createQueue).toHaveBeenCalledWith(
        [1, 2],
        'album',
        false,
        21,
        true,
        'Discovery'
      );
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes the panel when Escape is pressed', () => {
    const { container } = renderContainer();

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: 'Escape' });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('filters results when a specific filter pill is selected', async () => {
    renderContainer();
    await typeQuery('daft');

    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));

    await waitFor(() => {
      expect(screen.getByText('One More Time')).toBeDefined();
    });
    // Album rows are filtered out; artist names still appear inside song row subtitles
    expect(screen.queryByText('Discovery')).toBeNull();
    expect(screen.getAllByText('Daft Punk').length).toBe(2);
  });
});
