// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../../store/store';
import Sidebar from '../Sidebar';

// Mock NavLink to prevent RouterProvider requirement
vi.mock('../../NavLink', () => ({
  default: ({
    children,
    className,
    to,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    to?: string;
    [key: string]: unknown;
  }) => (
    <a className={className} href={to} {...props}>
      {children}
    </a>
  )
}));

// Mock react-i18next preserving initReactI18next for i18n initialization
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: { defaultValue?: string }) => {
        const translations: Record<string, string> = {
          'sideBar.home': 'Home',
          'sideBar.search': 'Search',
          'common.song_other': 'Songs',
          'common.playlist_other': 'Playlists',
          'common.folder_other': 'Folders',
          'common.artist_other': 'Artists',
          'common.album_other': 'Albums',
          'common.genre_other': 'Genres',
          'sideBar.insights': options?.defaultValue ?? 'Insights',
          'settingsPage.settings': 'Settings'
        };
        return translations[key] ?? options?.defaultValue ?? key;
      }
    })
  };
});

// Mock LibrarySchedulerStatus and LibraryDiagnosticsPanel
vi.mock('../LibrarySchedulerStatus', () => ({
  default: () => <div data-testid="scheduler-status" />
}));

vi.mock('../LibraryDiagnosticsPanel', () => ({
  default: () => <div data-testid="diagnostics-panel" />
}));

describe('Sidebar Navigation & visibleSideTabs Filtering', () => {
  beforeEach(() => {
    store.setState((prev) => ({
      ...prev,
      bodyBackgroundImage: false,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: {
            genres: true,
            folders: true,
            artists: true,
            albums: true,
            insights: true
          }
        }
      }
    }));
  });

  it('renders Insights tab by default when visibleSideTabs is not set / undefined', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: undefined
        }
      }
    }));

    render(<Sidebar />);
    const insightsText = screen.getByText('Insights');
    const insightsLink = insightsText.closest('a');

    expect(insightsLink).toBeDefined();
    expect(insightsLink?.getAttribute('href')).toBe('/main-player/insights');
  });

  it('renders Insights tab when visibleSideTabs.insights is explicitly true', () => {
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
            insights: true
          }
        }
      }
    }));

    render(<Sidebar />);
    const insightsText = screen.getByText('Insights');
    const insightsLink = insightsText.closest('a');

    expect(insightsLink).toBeDefined();
    expect(insightsLink?.getAttribute('href')).toBe('/main-player/insights');
  });

  it('filters out Insights tab when visibleSideTabs.insights is false', () => {
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

    render(<Sidebar />);
    const insightsText = screen.queryByText('Insights');

    expect(insightsText).toBeNull();
  });

  it('retains Insights tab when visibleSideTabs object is present but insights key is missing/undefined (backward compatibility)', () => {
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
            albums: true
          } as unknown as {
            genres: boolean;
            folders: boolean;
            artists: boolean;
            albums: boolean;
            insights?: boolean;
          }
        }
      }
    }));

    render(<Sidebar />);
    const insightsText = screen.getByText('Insights');
    const insightsLink = insightsText.closest('a');

    expect(insightsLink).toBeDefined();
    expect(insightsLink?.getAttribute('href')).toBe('/main-player/insights');
  });

  it('correctly toggles individual tabs without interfering with Insights', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: {
            genres: false,
            folders: false,
            artists: false,
            albums: false,
            insights: true
          }
        }
      }
    }));

    render(<Sidebar />);

    expect(screen.queryByText('Genres')).toBeNull();
    expect(screen.queryByText('Folders')).toBeNull();
    expect(screen.queryByText('Artists')).toBeNull();
    expect(screen.queryByText('Albums')).toBeNull();
    expect(screen.getByText('Insights')).toBeDefined();
  });
});
