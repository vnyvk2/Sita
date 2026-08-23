// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../../../contexts/AppUpdateContext';
import { store } from '../../../../store/store';
import { Route } from '../index';

// Polyfill ResizeObserver for jsdom
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Mock window.api
Object.defineProperty(window, 'api', {
  value: {
    properties: {
      isInDevelopment: false
    }
  },
  writable: true
});

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

// Mock react-i18next preserving initReactI18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) => {
        const translations: Record<string, string> = {
          'homePage.favoritesAndRecaps': 'Favorites and Recaps',
          'sideBar.insights': options?.defaultValue ?? 'Insights'
        };
        return translations[key] ?? options?.defaultValue ?? key;
      }
    })
  };
});

// Mock react-query suspense queries
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useSuspenseQuery: () => ({
      data: {
        data: []
      }
    })
  };
});

// Mock child components
vi.mock('../../../../components/HomePage/SpecialPlaylistCard', () => ({
  default: () => <div data-testid="special-playlist-card" />
}));
vi.mock('../../../../components/HomePage/RecentlyAddedSongs', () => ({
  default: () => <div data-testid="recently-added-songs" />
}));
vi.mock('../../../../components/HomePage/RecentlyPlayedSongs', () => ({
  default: () => <div data-testid="recently-played-songs" />
}));
vi.mock('../../../../components/HomePage/RecentlyPlayedArtists', () => ({
  default: () => <div data-testid="recently-played-artists" />
}));
vi.mock('../../../../components/HomePage/MostLovedSongs', () => ({
  default: () => <div data-testid="most-loved-songs" />
}));
vi.mock('../../../../components/HomePage/MostLovedArtists', () => ({
  default: () => <div data-testid="most-loved-artists" />
}));

describe('HomePage Insights Shortcut Button', () => {
  const mockContextValue: AppUpdateContextType = {
    playSong: vi.fn(),
    updateContextMenuData: vi.fn(),
    changePromptMenuData: vi.fn(),
    addNewNotifications: vi.fn(),
    toggleIsFavorite: vi.fn(),
    toggleMultipleSelections: vi.fn(),
    updateMultipleSelections: vi.fn(),
    createQueue: vi.fn(),
    openAutoTagDialog: vi.fn(),
    updateBodyBackgroundImage: vi.fn(),
    updateSongPosition: vi.fn(),
    updateVolume: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleMutedState: vi.fn(),
    changeQueueCurrentSongIndex: vi.fn(),
    reParseSong: vi.fn(),
    toggleMiniPlayer: vi.fn(),
    toggleSongPlayback: vi.fn(),
    skipSong: vi.fn(),
    handleSongPlaybackError: vi.fn(),
    updatePlaybackRate: vi.fn()
  };

  const HomePageComponent = Route.options.component!;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the accessible Insights shortcut button with title in the header', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <HomePageComponent />
      </AppUpdateContext.Provider>
    );

    const insightsBtn = screen.getByTitle('Insights');
    expect(insightsBtn).toBeDefined();
    expect(insightsBtn.tagName).toBe('BUTTON');
  });

  it('navigates to /main-player/insights when clicked', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <HomePageComponent />
      </AppUpdateContext.Provider>
    );

    const insightsBtn = screen.getByTitle('Insights');
    expect(insightsBtn).toBeDefined();

    fireEvent.click(insightsBtn);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/main-player/insights'
    });
  });

  it('remains available on Home even when visibleSideTabs.insights is disabled in preferences', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: {
            genres: true,
            folders: true,
            artists: true,
            albums: true,
            insights: false
          }
        }
      }
    }));

    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <HomePageComponent />
      </AppUpdateContext.Provider>
    );

    const insightsBtn = screen.getByTitle('Insights');
    expect(insightsBtn).toBeDefined();
  });
});
