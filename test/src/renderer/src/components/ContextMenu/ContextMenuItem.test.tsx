/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ContextMenuItem from '../../../../../../src/renderer/src/components/ContextMenu/ContextMenuItem';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';

const mockContextValue: AppUpdateContextType = {
  updateCurrentSongData: vi.fn(),
  updateContextMenuData: vi.fn(),
  changePromptMenuData: vi.fn(),
  changeUpNextSongData: vi.fn(),
  updatePromptMenuHistoryIndex: vi.fn(),
  playSong: vi.fn(),
  addNewNotifications: vi.fn(),
  updateNotifications: vi.fn(),
  createQueue: vi.fn(),
  changeQueueCurrentSongIndex: vi.fn(),
  updateCurrentSongPlaybackState: vi.fn(),
  updatePlayerType: vi.fn(),
  handleSkipBackwardClick: vi.fn(),
  handleSkipForwardClick: vi.fn(),
  updateSongPosition: vi.fn(),
  updateVolume: vi.fn(),
  toggleMutedState: vi.fn(),
  toggleRepeat: vi.fn(),
  toggleShuffling: vi.fn(),
  toggleQueueShuffle: vi.fn(),
  toggleIsFavorite: vi.fn(),
  toggleSongPlayback: vi.fn(),
  updateQueueData: vi.fn(),
  clearAudioPlayerData: vi.fn(),
  updateBodyBackgroundImage: vi.fn(),
  updateMultipleSelections: vi.fn(),
  toggleMultipleSelections: vi.fn(),
  toggleLyricsDrawer: vi.fn(),
  updateAppUpdatesState: vi.fn(),
  updateEqualizerOptions: vi.fn()
};

describe('ContextMenuItem & Fly-Out Submenu Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('renders standard menu item and triggers handlerFunction on click', () => {
    const handler = vi.fn();
    const updateContextMenuData = vi.fn();

    render(
      <AppUpdateContext.Provider value={{ ...mockContextValue, updateContextMenuData }}>
        <ContextMenuItem label="Play Song" iconName="play_arrow" handlerFunction={handler} />
      </AppUpdateContext.Provider>
    );

    const item = screen.getByText('Play Song');
    expect(item).toBeDefined();

    fireEvent.click(item);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(updateContextMenuData).toHaveBeenCalledWith(false, []);
  });

  it('renders clean separator when isContextMenuItemSeperator is true without showing label', () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <ContextMenuItem label="Hr" isContextMenuItemSeperator={true} handlerFunction={null} />
      </AppUpdateContext.Provider>
    );

    // Separator element exists
    const separator = container.querySelector('div[role="separator"]');
    expect(separator).toBeDefined();

    // The text 'Hr' is NOT rendered anywhere in DOM
    expect(screen.queryByText('Hr')).toBeNull();
  });

  it('renders chevron_right and flies out submenu on mouse hover', () => {
    const innerHandler = vi.fn();
    const updateContextMenuData = vi.fn();

    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [
        {
          label: 'Chill Vibes',
          iconName: 'check_box',
          handlerFunction: innerHandler
        },
        {
          label: 'Hr',
          isContextMenuItemSeperator: true,
          handlerFunction: null
        },
        {
          label: 'More options...',
          iconName: 'playlist_add_circle',
          handlerFunction: vi.fn()
        }
      ]
    };

    render(
      <AppUpdateContext.Provider value={{ ...mockContextValue, updateContextMenuData }}>
        <ContextMenuItem {...parentItem} />
      </AppUpdateContext.Provider>
    );

    // Chevron right indicator is present
    expect(screen.getByText('chevron_right')).toBeDefined();

    // Submenu is initially not in DOM
    expect(screen.queryByText('Chill Vibes')).toBeNull();

    // Hover over parent item
    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;
    fireEvent.mouseEnter(parentContainer);

    // Submenu is now visible with inner items
    expect(screen.getByText('Chill Vibes')).toBeDefined();
    expect(screen.getByText('More options...')).toBeDefined();

    // Click inner item
    fireEvent.click(screen.getByText('Chill Vibes'));
    expect(innerHandler).toHaveBeenCalledTimes(1);
    expect(updateContextMenuData).toHaveBeenCalledWith(false, []);
  });

  it('closes flyout after mouse leaves with graceful debounce', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [
        {
          label: 'Chill Vibes',
          handlerFunction: vi.fn()
        }
      ]
    };

    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <ContextMenuItem {...parentItem} />
      </AppUpdateContext.Provider>
    );

    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Hover in
    fireEvent.mouseEnter(parentContainer);
    expect(screen.getByText('Chill Vibes')).toBeDefined();

    // Mouse leave
    fireEvent.mouseLeave(parentContainer);

    // Still present immediately during debounce window (150ms)
    expect(screen.getByText('Chill Vibes')).toBeDefined();

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Submenu is now closed
    expect(screen.queryByText('Chill Vibes')).toBeNull();
  });
});
