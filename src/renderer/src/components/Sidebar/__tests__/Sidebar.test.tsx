// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { store } from '../../../store/store';
import { dndStore, workspaceActions } from '../../../workspace/store';
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
  useLocation: (opts?: { select?: (loc: unknown) => unknown }) => {
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

describe('Experimental Workspace Sidebar Pinning & 2-Way Width', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentPathname = '/main-player/home';
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          isExperimentalWorkspaceEnabled: true
        }
      }
    }));
    dndStore.setState((s) => ({
      ...s,
      isSidebarPinned: true,
      isSidebarPeeking: false,
      sidebarWidthMode: 'expanded',
      sidebarMode: 'expanded'
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders pin button and 2-way size toggle in expanded pinned mode', () => {
    render(<Sidebar />);
    const pinBtn = screen.getByRole('button', { name: /unpin sidebar/i });
    const collapseBtn = screen.getByRole('button', { name: /collapse to icon rail/i });

    expect(pinBtn).toBeDefined();
    expect(collapseBtn).toBeDefined();
  });

  it('toggles width strictly between expanded and compact (no 3-way cycle)', () => {
    render(<Sidebar />);
    const collapseBtn = screen.getByRole('button', { name: /collapse to icon rail/i });
    act(() => {
      fireEvent.click(collapseBtn);
    });

    expect(dndStore.state.sidebarWidthMode).toBe('compact');
    expect(dndStore.state.sidebarMode).toBe('compact');

    // Clicking again expands it back to expanded
    act(() => {
      workspaceActions.toggleSidebarWidth();
    });
    expect(dndStore.state.sidebarWidthMode).toBe('expanded');
    expect(dndStore.state.sidebarMode).toBe('expanded');
  });

  it('unpins sidebar and sets state to unpinned / hidden', () => {
    render(<Sidebar />);
    const pinBtn = screen.getByRole('button', { name: /unpin sidebar/i });
    act(() => {
      fireEvent.click(pinBtn);
    });

    expect(dndStore.state.isSidebarPinned).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('hidden');
  });

  it('automatically closes peeking sidebar on mouse leave after 250ms debounce', () => {
    dndStore.setState((s) => ({
      ...s,
      isSidebarPinned: false,
      isSidebarPeeking: true,
      sidebarMode: 'expanded'
    }));

    const { container } = render(<Sidebar />);
    const nav = container.querySelector('nav');
    expect(nav).toBeDefined();

    fireEvent.mouseLeave(nav!);
    expect(dndStore.state.isSidebarPeeking).toBe(true); // Still open during grace period

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(dndStore.state.isSidebarPeeking).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('hidden');
  });

  it('cancels auto-close if mouse re-enters before debounce timer expires', () => {
    dndStore.setState((s) => ({
      ...s,
      isSidebarPinned: false,
      isSidebarPeeking: true,
      sidebarMode: 'expanded'
    }));

    const { container } = render(<Sidebar />);
    const nav = container.querySelector('nav');

    fireEvent.mouseLeave(nav!);
    act(() => {
      vi.advanceTimersByTime(100);
    });

    fireEvent.mouseEnter(nav!);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(dndStore.state.isSidebarPeeking).toBe(true);
  });

  it('pins sidebar while peeking to make it docked and permanent', () => {
    dndStore.setState((s) => ({
      ...s,
      isSidebarPinned: false,
      isSidebarPeeking: true,
      sidebarMode: 'expanded'
    }));

    render(<Sidebar />);
    const pinBtn = screen.getByRole('button', { name: /pin sidebar/i });
    fireEvent.click(pinBtn);

    expect(dndStore.state.isSidebarPinned).toBe(true);
    expect(dndStore.state.isSidebarPeeking).toBe(false);
    expect(dndStore.state.sidebarMode).toBe('expanded');
  });
});
