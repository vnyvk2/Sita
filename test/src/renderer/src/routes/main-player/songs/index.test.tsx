import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { artistQuery } from '@renderer/queries/artists';
import { songQuery } from '@renderer/queries/songs';
import { Route } from '@renderer/routes/main-player/songs/index';
/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@assets/images/svg/Empty Inbox _Monochromatic.svg', () => ({
  default: 'mock-no-songs-svg'
}));

const mockNavigate = vi.fn();
let mockSearchState: {
  sortingOrder?: string;
  filteringOrder?: string;
  keyword?: string;
  language?: string;
  genre?: string;
  onlyFavoriteArtists?: boolean;
  onlyFavoriteAlbums?: boolean;
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
        if (key === 'songsPage.noMatchingSongsTitle') return 'No matching songs found';
        if (key === 'songsPage.noMatchingSongsDesc')
          return `No songs match "${opts?.keyword ?? ''}"`;
        if (key === 'songsPage.noFilteredSongsDesc') return 'No songs match the selected filters';
        if (key === 'songsPage.empty') return "There's nothing here..";
        if (key === 'common.song_other') return 'Songs';
        if (key === 'common.songWithCount') return `${opts?.count ?? 0} songs`;
        if (key === 'foldersPage.addFolder') return 'Add folder';
        if (key === 'settingsPage.importAppData') return 'Import app data';
        if (key === 'searchPage.searchPlaceholderSongs') return 'Search songs...';
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@renderer/components/VirtualizedList', () => ({
  default: ({ data }: { data: any[] }) => (
    <div data-testid="virtualized-list">
      {data.map((item, i) => (
        <div key={item.songId ?? i} data-testid="song-item">
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
  updateContextMenuData: vi.fn(),
  createQueue: vi.fn(),
  updateQueueData: vi.fn(),
  changePromptMenuData: vi.fn()
};

describe('SongsPage Search & Navigation State Split', () => {
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
      keyword: 'nonexistent_song',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      songQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_song'
      }).queryKey,
      { data: [] }
    );
    queryClient.setQueryData(
      artistQuery.all({ sortType: 'aToZ', filterType: 'favorites', start: 0, end: 0 }).queryKey,
      { data: [] }
    );

    const SongsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <SongsPageComponent />
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
    const searchInput = getByPlaceholderText('Search songs...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_song');

    // 2. Compact empty search state is shown
    expect(getByText('No matching songs found')).not.toBeNull();
    expect(getByText('No songs match "nonexistent_song"')).not.toBeNull();
    expect(getByText('search_off')).not.toBeNull();

    // 3. Onboarding buttons (Add folder / Import) are NOT rendered
    expect(queryByText('Add folder')).toBeNull();
    expect(queryByText("There's nothing here..")).toBeNull();
  });

  it('allows user to edit search input when in zero-match state without unmounting', () => {
    vi.useFakeTimers();
    mockSearchState = {
      keyword: 'nonexistent_song',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      songQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'nonexistent_song'
      }).queryKey,
      { data: [] }
    );
    queryClient.setQueryData(
      artistQuery.all({ sortType: 'aToZ', filterType: 'favorites', start: 0, end: 0 }).queryKey,
      { data: [] }
    );

    const SongsPageComponent = Route.options.component!;
    const { getByPlaceholderText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <SongsPageComponent />
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

    const searchInput = getByPlaceholderText('Search songs...') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.value).toBe('nonexistent_song');

    // Simulate clearing / backspacing query and advancing debounce timer
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(searchInput.value).toBe('');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mockNavigate).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps PageSearchInput rendered and displays empty library state when library has zero songs and no filter/search is active', () => {
    mockSearchState = { keyword: undefined, filteringOrder: 'notSelected', sortingOrder: 'aToZ' };

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      songQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: ''
      }).queryKey,
      { data: [] }
    );
    queryClient.setQueryData(
      artistQuery.all({ sortType: 'aToZ', filterType: 'favorites', start: 0, end: 0 }).queryKey,
      { data: [] }
    );

    const SongsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <SongsPageComponent />
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
    expect(getByPlaceholderText('Search songs...')).not.toBeNull();

    // 2. Empty library state and onboarding buttons are shown
    expect(getByText("There's nothing here..")).not.toBeNull();
    expect(getByText('Add folder')).not.toBeNull();

    // 3. Compact search_off state is NOT rendered
    expect(queryByText('No matching songs found')).toBeNull();
  });

  it('renders songs list when matching songs exist', () => {
    mockSearchState = {
      keyword: 'Imagine',
      filteringOrder: 'notSelected',
      sortingOrder: 'aToZ'
    };
    const sampleSongs = [
      {
        songId: 1,
        title: 'Imagine',
        artists: [{ artistId: 1, name: 'John Lennon' }],
        duration: 183,
        path: '/music/imagine.mp3'
      }
    ];

    const queryClient = new QueryClient();
    queryClient.setQueryData(
      songQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0,
        end: 0,
        keyword: 'Imagine'
      }).queryKey,
      { data: sampleSongs }
    );
    queryClient.setQueryData(
      artistQuery.all({ sortType: 'aToZ', filterType: 'favorites', start: 0, end: 0 }).queryKey,
      { data: [] }
    );

    const SongsPageComponent = Route.options.component!;
    const { getByPlaceholderText, getByTestId, getByText, queryByText } = render(
      <Suspense fallback={<div>Loading...</div>}>
        <SongsPageComponent />
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
    expect(getByPlaceholderText('Search songs...')).not.toBeNull();

    // 2. List rendered with item
    expect(getByTestId('virtualized-list')).not.toBeNull();
    expect(getByText('Imagine')).not.toBeNull();

    // 3. Neither empty state is shown
    expect(queryByText('No matching songs found')).toBeNull();
    expect(queryByText("There's nothing here..")).toBeNull();
  });
});
