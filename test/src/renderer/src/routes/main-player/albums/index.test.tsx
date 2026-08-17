import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { albumQuery } from '@renderer/queries/albums';
import { Route } from '@renderer/routes/main-player/albums/index';
/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@assets/images/svg/Easter bunny_Monochromatic.svg', () => ({
  default: 'mock-no-albums-svg'
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
        if (key === 'albumsPage.noMatchingAlbumsTitle') return 'No matching albums found';
        if (key === 'albumsPage.noMatchingAlbumsDesc')
          return `No albums match "${opts?.keyword ?? ''}"`;
        if (key === 'albumsPage.noFilteredAlbumsDesc') return 'No albums match the selected filter';
        if (key === 'albumsPage.empty') return "There's nothing here...";
        if (key === 'common.album_other') return 'Albums';
        if (key === 'common.albumWithCount') return `${opts?.count ?? 0} albums`;
        if (key === 'searchPage.searchPlaceholderAlbums') return 'Search albums...';
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
        <div key={item.albumId ?? i} data-testid="album-item">
          {item.title}
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

describe('AlbumsPage Search & Navigation State Split', () => {
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
      keyword: 'nonexistent_album',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      albumQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_album'
      }).queryKey,
      { data: [] }
    );

    const AlbumsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <AlbumsPageComponent />
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
    const searchInput = getByPlaceholderText('Search albums...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_album');

    // 2. Compact empty search state is shown
    expect(getByText('No matching albums found')).not.toBeNull();
    expect(getByText('No albums match "nonexistent_album"')).not.toBeNull();
    expect(getByText('search_off')).not.toBeNull();

    // 3. Fullscreen onboarding/empty library state is NOT rendered
    expect(queryByText("There's nothing here...")).toBeNull();
  });

  it('allows user to edit search input when in zero-match state without unmounting', () => {
    vi.useFakeTimers();
    mockSearchState = {
      keyword: 'nonexistent_album',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      albumQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_album'
      }).queryKey,
      { data: [] }
    );

    const AlbumsPageComponent = Route.options.component!;
    const { getByPlaceholderText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <AlbumsPageComponent />
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

    const searchInput = getByPlaceholderText('Search albums...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_album');

    // Simulate clearing / backspacing query and advancing debounce timer
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(searchInput.value).toBe('');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockNavigate).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps PageSearchInput rendered and displays empty library state when library has zero albums and no filter/search is active', () => {
    mockSearchState = { keyword: undefined, filteringOrder: 'notSelected', sortingOrder: 'aToZ' };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      albumQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: ''
      }).queryKey,
      { data: [] }
    );

    const AlbumsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <AlbumsPageComponent />
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
    expect(getByPlaceholderText('Search albums...')).not.toBeNull();

    // 2. Empty library state is shown
    expect(getByText("There's nothing here...")).not.toBeNull();

    // 3. Compact search_off state is NOT rendered
    expect(queryByText('No matching albums found')).toBeNull();
  });

  it('renders albums grid when matching albums exist', () => {
    mockSearchState = {
      keyword: 'Thriller',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };
    const sampleAlbums = [
      {
        albumId: 1,
        title: 'Thriller',
        artists: [{ artistId: 1, name: 'Michael Jackson' }],
        songs: [],
        artworkPaths: { default: '' },
        year: 1982
      }
    ];

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      albumQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'Thriller'
      }).queryKey,
      { data: sampleAlbums }
    );

    const AlbumsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <AlbumsPageComponent />
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
    expect(getByPlaceholderText('Search albums...')).not.toBeNull();

    // 2. Grid rendered with item
    expect(getByTestId('virtualized-grid')).not.toBeNull();
    expect(getByText('Thriller')).not.toBeNull();

    // 3. Neither empty state is shown
    expect(queryByText('No matching albums found')).toBeNull();
    expect(queryByText("There's nothing here...")).toBeNull();
  });
});
