// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LyricsDrawer from '../../../../../../src/renderer/src/components/LyricsPage/LyricsDrawer';
import { AppUpdateContext, type AppUpdateContextType } from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

const mockNavigate = vi.fn();
let mockPathname = '/main-player/songs';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({
    pathname: mockPathname,
    searchStr: 'sortBy=title'
  })
}));

describe('LyricsDrawer', () => {
  let queryClient: QueryClient;
  const mockContextValues: Partial<AppUpdateContextType> = {
    toggleLyricsDrawer: vi.fn(),
    toggleSongPlayback: vi.fn(),
    handleSkipBackwardClick: vi.fn(),
    handleSkipForwardClick: vi.fn()
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/main-player/songs';
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false }
      }
    });

    store.setState((prev) => ({
      ...prev,
      isLyricsDrawerOpen: true,
      currentSongData: {
        songId: 1,
        title: 'Heroes',
        artists: [{ artistId: 1, name: 'David Bowie' }],
        duration: 360,
        path: '/music/heroes.mp3',
        isAFavorite: false,
        isKnownSource: true,
        isBlacklisted: false
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          lyricsBackground: 'default'
        }
      }
    }));
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContextValues as AppUpdateContextType}>
          <LyricsDrawer />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

  it('should not render anything when isLyricsDrawerOpen is false', () => {
    store.setState((prev) => ({ ...prev, isLyricsDrawerOpen: false }));
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });

  it('should not render when currently on central lyrics page', () => {
    mockPathname = '/main-player/lyrics';
    const { container } = renderComponent();
    expect(container.firstChild).toBeNull();
  });

  it('should render header with track title and artist name when open', () => {
    renderComponent();
    expect(screen.getByText('Heroes')).toBeDefined();
    expect(screen.getByText('David Bowie')).toBeDefined();
  });

  it('should call toggleLyricsDrawer(false) when close button is clicked', () => {
    const { container } = renderComponent();
    const closeBtn = container.querySelector('.close-drawer-btn') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(mockContextValues.toggleLyricsDrawer).toHaveBeenCalledWith(false);
  });

  it('should navigate to /main-player/lyrics preserving from location and close drawer on expand', () => {
    const { container } = renderComponent();
    const expandBtn = container.querySelector('.expand-to-page-btn') as HTMLButtonElement;
    expect(expandBtn).not.toBeNull();
    fireEvent.click(expandBtn);

    expect(mockContextValues.toggleLyricsDrawer).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/main-player/lyrics',
      search: { from: '/main-player/songs?sortBy=title' }
    });
  });
});
