import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { artistQuery } from '@renderer/queries/artists';
import { Route } from '@renderer/routes/main-player/artists/index';
/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@assets/images/svg/Sun_Monochromatic.svg', () => ({
  default: 'mock-no-artists-svg'
}));

const mockNavigate = vi.fn();
let mockSearchState: {
  sortingOrder?: string;
  filteringOrder?: string;
  keyword?: string;
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
        if (key === 'artistsPage.noMatchingArtistsTitle') return 'No matching artists found';
        if (key === 'artistsPage.noMatchingArtistsDesc')
          return `No artists match "${opts?.keyword ?? ''}"`;
        if (key === 'artistsPage.noFilteredArtistsDesc')
          return 'No artists match the selected filter';
        if (key === 'artistsPage.empty') return "There's nothing here...";
        if (key === 'common.artist_other') return 'Artists';
        if (key === 'common.artistWithCount') return `${opts?.count ?? 0} artists`;
        if (key === 'searchPage.searchPlaceholderArtists') return 'Search artists...';
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@renderer/components/VirtualizedGrid', () => ({
  default: ({ data }: { data: any[] }) => (
    <div data-testid="virtualized-grid">
      {data.map((item, i) => (
        <div key={item.artistId ?? i} data-testid="artist-item">
          {item.name}
        </div>
      ))}
    </div>
  )
}));

vi.mock('@renderer/components/Img', () => ({
  default: (props: any) => <img data-testid="mock-img" alt={props.alt ?? ''} {...props} />
}));

const mockContextValue: Partial<AppUpdateContextType> = {
  toggleMultipleSelections: vi.fn(),
  updateContextMenuData: vi.fn()
};

describe('ArtistPage Search & Navigation State Split', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSearchState = {};

    vi.spyOn(Route, 'useSearch').mockImplementation(() => mockSearchState as any);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps PageSearchInput rendered and displays compact empty search state when query yields zero results', () => {
    mockSearchState = {
      keyword: 'nonexistent_artist',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      artistQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_artist'
      }).queryKey,
      { data: [] }
    );

    const ArtistPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ArtistPageComponent />
      </Suspense>,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
              {children}
            </AppUpdateContext.Provider>
          </QueryClientProvider>
        )
      }
    );

    // 1. Search input remains mounted and accessible
    const searchInput = getByPlaceholderText('Search artists...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_artist');

    // 2. Compact empty search state is shown
    expect(getByText('No matching artists found')).not.toBeNull();
    expect(getByText('No artists match "nonexistent_artist"')).not.toBeNull();
    expect(getByText('search_off')).not.toBeNull();

    // 3. Fullscreen onboarding/empty library state is NOT rendered
    expect(queryByText("There's nothing here...")).toBeNull();
  });

  it('allows user to edit search input when in zero-match state without unmounting', () => {
    vi.useFakeTimers();
    mockSearchState = {
      keyword: 'nonexistent_artist',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      artistQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_artist'
      }).queryKey,
      { data: [] }
    );

    const ArtistPageComponent = Route.options.component!;
    const { getByPlaceholderText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ArtistPageComponent />
      </Suspense>,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
              {children}
            </AppUpdateContext.Provider>
          </QueryClientProvider>
        )
      }
    );

    const searchInput = getByPlaceholderText('Search artists...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_artist');

    // Simulate clearing / backspacing query and advancing debounce timer
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(searchInput.value).toBe('');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockNavigate).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps PageSearchInput rendered and displays empty library state when library has zero artists and no filter/search is active', () => {
    mockSearchState = { keyword: undefined, filteringOrder: 'notSelected', sortingOrder: 'aToZ' };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      artistQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: ''
      }).queryKey,
      { data: [] }
    );

    const ArtistPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ArtistPageComponent />
      </Suspense>,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
              {children}
            </AppUpdateContext.Provider>
          </QueryClientProvider>
        )
      }
    );

    // 1. Search input is still present in header
    expect(getByPlaceholderText('Search artists...')).not.toBeNull();

    // 2. Empty library state is shown
    expect(getByText("There's nothing here...")).not.toBeNull();

    // 3. Compact search_off state is NOT rendered
    expect(queryByText('No matching artists found')).toBeNull();
  });

  it('renders artists grid when matching artists exist', () => {
    mockSearchState = {
      keyword: 'Queen',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };
    const sampleArtists = [
      {
        artistId: 1,
        name: 'Queen',
        songs: [],
        artworkPaths: { default: '' }
      }
    ];

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      artistQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'Queen'
      }).queryKey,
      { data: sampleArtists }
    );

    const ArtistPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <ArtistPageComponent />
      </Suspense>,
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            <AppUpdateContext.Provider value={mockContextValue as AppUpdateContextType}>
              {children}
            </AppUpdateContext.Provider>
          </QueryClientProvider>
        )
      }
    );

    // 1. Header and search input rendered
    expect(getByPlaceholderText('Search artists...')).not.toBeNull();

    // 2. Grid rendered with item
    expect(getByTestId('virtualized-grid')).not.toBeNull();
    expect(getByText('Queen')).not.toBeNull();

    // 3. Neither empty state is shown
    expect(queryByText('No matching artists found')).toBeNull();
    expect(queryByText("There's nothing here...")).toBeNull();
  });
});
