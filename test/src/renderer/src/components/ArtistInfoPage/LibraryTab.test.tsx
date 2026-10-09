// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LibraryTab from '@renderer/components/ArtistInfoPage/LibraryTab';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: any) => {
        if (typeof opts === 'string') return opts;
        if (opts?.defaultValue) return opts.defaultValue;
        if (key === 'common.showAll') return 'Show All';
        return key;
      }
    })
  };
});

// Mock Img component
vi.mock('@renderer/components/Img', () => ({
  default: (props: any) => <img alt={props.alt} src={props.src} />
}));

// Mock Song component
vi.mock('@renderer/components/SongsPage/Song', () => ({
  default: (props: any) => (
    <div data-testid={`song-row-${props.songId}`}>
      Song {props.title} (ID: {props.songId})
    </div>
  )
}));

// Mock suggestions
vi.mock('@renderer/components/ArtistInfoPage/DuplicateArtistsSuggestion', () => ({
  default: () => null
}));
vi.mock('@renderer/components/ArtistInfoPage/SeparateArtistsSuggestion', () => ({
  default: () => null
}));

// Track VirtualizedList props passed by LibraryTab
let lastVirtualizedListProps: any = null;
vi.mock('@renderer/components/VirtualizedList', () => ({
  default: (props: any) => {
    lastVirtualizedListProps = props;
    return (
      <div data-testid="mock-virtualized-list">
        {props.data?.map((item: any, idx: number) => (
          <div key={item.songId || idx}>
            {props.itemContent(idx, item)}
          </div>
        ))}
      </div>
    );
  }
}));

const mockSongs: any[] = Array.from({ length: 25 }, (_, i) => ({
  songId: i + 1,
  title: `Track ${i + 1}`,
  artists: [{ name: 'Test Artist', artistId: '1' }],
  album: { name: 'Test Album', albumId: 1 },
  duration: 180,
  path: `/music/track_${i + 1}.mp3`,
  isAFavorite: false,
  year: 2024,
  isBlacklisted: false
}));

vi.mock('@renderer/hooks/useWindowHydration', () => ({
  useWindowHydration: () => ({
    getItem: (index: number) => mockSongs[index],
    onRangeChange: vi.fn()
  })
}));

// Mock TanStack React Query
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: any) => {
      // If querying songQuery.ids
      if (options?.queryKey?.[0]?.includes('songs')) {
        return {
          data: {
            ids: mockSongs.map((s) => s.songId),
            total: mockSongs.length,
            blacklistedIds: []
          },
          dataUpdatedAt: Date.now()
        };
      }
      // If querying albumQuery.allAlbumInfo
      return { data: [] };
    },
    useMutation: () => ({ mutate: vi.fn() })
  };
});

const mockArtistData: any = {
  artistId: 1,
  name: 'Test Artist',
  songs: mockSongs.map((s) => ({ songId: s.songId, title: s.title })),
  albums: [],
  isAFavorite: false
};

const mockAppContext: any = {
  createQueue: vi.fn(),
  updateContextMenuData: vi.fn(),
  toggleMultipleSelections: vi.fn(),
  updateQueueData: vi.fn()
};

describe('LibraryTab - Song Virtualization on Show All', () => {
  beforeEach(() => {
    lastVirtualizedListProps = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders only the first 5 songs when isAllSongsVisible is false', () => {
    render(
      <div className="artist-info-page-container">
        <AppUpdateContext.Provider value={mockAppContext}>
          <LibraryTab
            artistData={mockArtistData}
            sortingOrder="aToZ"
            onSortingOrderChange={vi.fn()}
          />
        </AppUpdateContext.Provider>
      </div>
    );

    // Initial state: VirtualizedList should NOT be rendered
    expect(screen.queryByTestId('mock-virtualized-list')).toBeNull();

    // Exactly 5 song rows should be rendered in the DOM
    for (let id = 1; id <= 5; id++) {
      expect(screen.getByTestId(`song-row-${id}`)).toBeDefined();
    }
    // Song 6 should NOT be rendered
    expect(screen.queryByTestId('song-row-6')).toBeNull();

    // Show All button should be visible
    expect(screen.getByText('Show All')).toBeDefined();
  });

  it('renders VirtualizedList with scrollParent, fixedItemHeight=60, and all songs when Show All is clicked', () => {
    const { container } = render(
      <div className="artist-info-page-container">
        <AppUpdateContext.Provider value={mockAppContext}>
          <LibraryTab
            artistData={mockArtistData}
            sortingOrder="aToZ"
            onSortingOrderChange={vi.fn()}
          />
        </AppUpdateContext.Provider>
      </div>
    );

    const showAllBtn = screen.getByText('Show All');
    fireEvent.click(showAllBtn);

    // VirtualizedList is now mounted
    expect(screen.getByTestId('mock-virtualized-list')).toBeDefined();

    // Verify props passed to VirtualizedList
    expect(lastVirtualizedListProps).toBeDefined();
    expect(lastVirtualizedListProps.data.length).toBe(25);
    expect(lastVirtualizedListProps.fixedItemHeight).toBe(60);

    // Verify customScrollParent was resolved to .artist-info-page-container
    const pageContainer = container.querySelector('.artist-info-page-container');
    expect(lastVirtualizedListProps.customScrollParent).toBe(pageContainer);
  });

  it('guards crash resilience: Show All passes full songs array (data.length === songs.length) to VirtualizedList', () => {
    render(
      <div className="artist-info-page-container">
        <AppUpdateContext.Provider value={mockAppContext}>
          <LibraryTab
            artistData={mockArtistData}
            sortingOrder="aToZ"
            onSortingOrderChange={vi.fn()}
          />
        </AppUpdateContext.Provider>
      </div>
    );

    const showAllBtn = screen.getByText('Show All');
    fireEvent.click(showAllBtn);

    // Virtuoso must receive the complete dataset array, allowing bounded DOM virtualization
    expect(lastVirtualizedListProps).not.toBeNull();
    expect(lastVirtualizedListProps.data).toHaveLength(mockSongs.length);
    expect(lastVirtualizedListProps.data).toEqual(mockSongs.map((s) => s.songId));
  });
});
