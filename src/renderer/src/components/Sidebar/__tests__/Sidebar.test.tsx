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

let currentPathname = '/main-player/home';

// Mock @tanstack/react-router
vi.mock('@tanstack/react-router', () => ({
  useLocation: (opts?: { select?: (loc: any) => any }) => {
    const loc = { pathname: currentPathname, href: `http://localhost${currentPathname}` };
    return opts?.select ? opts.select(loc) : loc;
  },
  linkOptions: <T,>(opts: T): T => opts,
  Link: ({
    children,
    to,
    ...props
  }: {
    children?: React.ReactNode;
    to?: string;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
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

vi.mock('../SidebarPlaylistsSection', () => ({
  default: () => <div data-testid="sidebar-playlists-section" />
}));

vi.mock('../SidebarResizer', () => ({
  default: () => <div data-testid="sidebar-resizer" />
}));

describe('Sidebar Navigation & visibleSideTabs Filtering', () => {
  beforeEach(() => {
    currentPathname = '/main-player/home';
    store.setState((prev) => ({
      ...prev,
      bodyBackgroundImage: '',
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

describe('SidebarPlaylistsSection Gating', () => {
  beforeEach(() => {
    currentPathname = '/main-player/home';
  });

  it('renders SidebarPlaylistsSection and SidebarResizer when playlist detail is open and showSidebarPlaylistsSection is true', () => {
    currentPathname = '/main-player/playlists/42';
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showSidebarPlaylistsSection: true
        }
      }
    }));

    render(<Sidebar />);

    expect(screen.getByTestId('sidebar-playlists-section')).toBeDefined();
    expect(screen.getByTestId('sidebar-resizer')).toBeDefined();
  });

  it('renders SidebarPlaylistsSection by default when showSidebarPlaylistsSection is undefined (backward compatibility)', () => {
    currentPathname = '/main-player/playlists/42';
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showSidebarPlaylistsSection: undefined
        }
      }
    }));

    render(<Sidebar />);

    expect(screen.getByTestId('sidebar-playlists-section')).toBeDefined();
    expect(screen.getByTestId('sidebar-resizer')).toBeDefined();
  });

  it('does NOT render SidebarPlaylistsSection or SidebarResizer when showSidebarPlaylistsSection is false', () => {
    currentPathname = '/main-player/playlists/42';
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showSidebarPlaylistsSection: false
        }
      }
    }));

    render(<Sidebar />);

    expect(screen.queryByTestId('sidebar-playlists-section')).toBeNull();
    expect(screen.queryByTestId('sidebar-resizer')).toBeNull();
    // Primary navigation links are still rendered
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Playlists')).toBeDefined();
  });
});
