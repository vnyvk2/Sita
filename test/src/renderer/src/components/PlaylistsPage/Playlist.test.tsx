/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Playlist } from '../../../../../../src/renderer/src/components/PlaylistsPage/Playlist';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any) => {
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        if (defaultValOrOptions && typeof defaultValOrOptions === 'object' && defaultValOrOptions.count !== undefined) {
          return `${defaultValOrOptions.count} songs`;
        }
        return key;
      }
    })
  };
});

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate
}));

vi.mock('../../../../../../src/renderer/src/components/PlaylistsPage/PlaylistCover', () => ({
  default: () => <div data-testid="playlist-cover">Cover</div>
}));

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, className, onClick, onContextMenu, ...rest }: any) => (
    <div
      data-testid="nav-link"
      className={className}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...rest}
    >
      {children}
    </div>
  )
}));

vi.mock('../../../../../../src/renderer/src/hooks/collections/useCollectionMutations', () => ({
  usePinCollection: () => ({ mutate: vi.fn() }),
  useUnpinCollection: () => ({ mutate: vi.fn() })
}));

describe('Playlist Component', () => {
  const updateContextMenuDataMock = vi.fn();
  const createQueueMock = vi.fn();
  const toggleMultipleSelectionsMock = vi.fn();
  const updateMultipleSelectionsMock = vi.fn();

  const mockContextValue: Partial<AppUpdateContextType> = {
    createQueue: createQueueMock,
    updateContextMenuData: updateContextMenuDataMock,
    addNewNotifications: vi.fn(),
    toggleMultipleSelections: toggleMultipleSelectionsMock,
    updateMultipleSelections: updateMultipleSelectionsMock
  };

  const defaultProps = {
    index: 0,
    id: 42,
    name: 'Chill Vibes',
    itemCount: 15,
    isPinned: false,
    playlistType: 'user' as const,
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      multipleSelectionsData: {
        isEnabled: false,
        selectionType: 'playlist',
        multipleSelections: []
      }
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders playlist name and item count', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Playlist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    expect(screen.getByText('Chill Vibes')).toBeDefined();
    expect(screen.getByText('15 songs')).toBeDefined();
  });

  it('calls openPlaylistInfoPage on click when multiple selections is disabled', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Playlist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    const titleBtn = screen.getByRole('button', { name: 'Chill Vibes' });
    fireEvent.click(titleBtn);

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/main-player/playlists/$playlistId',
      params: { playlistId: '42' }
    });
  });

  it('handles right click to show context menu on demand', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Playlist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    const navLink = screen.getByTestId('nav-link');
    fireEvent.contextMenu(navLink, { pageX: 100, pageY: 200 });

    expect(updateContextMenuDataMock).toHaveBeenCalledTimes(1);
    const [isVisible, items, , , itemData] = updateContextMenuDataMock.mock.calls[0];
    expect(isVisible).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(itemData.title).toBe('Chill Vibes');
  });

  it('shows multiple selection checkbox when multiple selection is active for playlist', () => {
    store.setState((prev) => ({
      ...prev,
      multipleSelectionsData: {
        isEnabled: true,
        selectionType: 'playlist',
        multipleSelections: [42]
      }
    }));

    render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Playlist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDefined();
  });
});
