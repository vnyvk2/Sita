// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../../../store/store';
import { NavigationPanel } from '../NavigationPanel';

let currentPathname = '/main-player/home';

// Mock @tanstack/react-router
vi.mock('@tanstack/react-router', () => ({
  useLocation: (opts?: { select?: (loc: { pathname: string; href: string }) => unknown }) => {
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

// Mock react-i18next
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

// Mock SideBarItem to prevent NavLink dependencies
vi.mock('@renderer/components/Sidebar/SideBarItem', () => ({
  default: ({ content, to }: { content: string; to: string }) => (
    <div data-testid="sidebar-item" data-to={to}>
      {content}
    </div>
  )
}));

// Mock LibrarySchedulerStatus, LibraryDiagnosticsPanel, SidebarPlaylistsSection, SidebarResizer
vi.mock('@renderer/components/Sidebar/LibrarySchedulerStatus', () => ({
  default: () => <div data-testid="scheduler-status" />
}));

vi.mock('@renderer/components/Sidebar/LibraryDiagnosticsPanel', () => ({
  default: () => <div data-testid="diagnostics-panel" />
}));

vi.mock('@renderer/components/Sidebar/SidebarPlaylistsSection', () => ({
  default: () => <div data-testid="sidebar-playlists-section" />
}));

vi.mock('@renderer/components/Sidebar/SidebarResizer', () => ({
  default: () => <div data-testid="sidebar-resizer" />
}));

describe('NavigationPanel SidebarPlaylistsSection Gating', () => {
  beforeEach(() => {
    currentPathname = '/main-player/home';
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          visibleSideTabs: {
            artists: true,
            albums: true,
            genres: true,
            insights: true
          },
          showSidebarPlaylistsSection: true
        }
      }
    }));
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

    render(<NavigationPanel panelId="navigation-panel" />);

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

    render(<NavigationPanel panelId="navigation-panel" />);

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

    render(<NavigationPanel panelId="navigation-panel" />);

    expect(screen.queryByTestId('sidebar-playlists-section')).toBeNull();
    expect(screen.queryByTestId('sidebar-resizer')).toBeNull();
    // Primary navigation links remain rendered
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Playlists')).toBeDefined();
  });
});
