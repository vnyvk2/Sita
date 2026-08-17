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
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 800
    });
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
        <div id="context-menu-root" style={{ width: '200px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
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

  it('calculates right placement when within viewport boundaries', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [{ label: 'Chill Vibes', handlerFunction: vi.fn() }]
    };

    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px', left: '100px', top: '100px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const rootElement = container.querySelector('#context-menu-root') as HTMLElement;
    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Mock getBoundingClientRect for normal position (left = 100, right = 300, window width = 1200)
    vi.spyOn(rootElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 100,
      right: 300,
      bottom: 400,
      width: 200,
      height: 300,
      x: 100,
      y: 100,
      toJSON: () => {}
    });

    vi.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue({
      top: 150,
      left: 100,
      right: 300,
      bottom: 180,
      width: 200,
      height: 30,
      x: 100,
      y: 150,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(parentContainer);

    const submenu = screen.getByTestId('flyout-submenu');
    expect(submenu).toBeDefined();
    // left is set to rootRect.width (200px)
    expect(submenu.style.left).toBe('200px');
  });

  it('flips to left placement when near right edge of viewport', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [{ label: 'Chill Vibes', handlerFunction: vi.fn() }]
    };

    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px', left: '1050px', top: '100px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const rootElement = container.querySelector('#context-menu-root') as HTMLElement;
    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Mock getBoundingClientRect near right edge (right = 1150px, +352 > 1200)
    vi.spyOn(rootElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 950,
      right: 1150,
      bottom: 400,
      width: 200,
      height: 300,
      x: 950,
      y: 100,
      toJSON: () => {}
    });

    vi.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue({
      top: 150,
      left: 950,
      right: 1150,
      bottom: 180,
      width: 200,
      height: 30,
      x: 950,
      y: 150,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(parentContainer);

    const submenu = screen.getByTestId('flyout-submenu');
    expect(submenu).toBeDefined();
    // right is set to rootRect.width (200px)
    expect(submenu.style.right).toBe('200px');
  });

  it('adjusts top offset upwards when near bottom edge of viewport', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [{ label: 'Chill Vibes', handlerFunction: vi.fn() }]
    };

    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px', left: '100px', top: '500px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const rootElement = container.querySelector('#context-menu-root') as HTMLElement;
    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Window height = 800px.
    // Parent item at top = 650px.
    // 650 + 352 = 1002px (> 800px window.innerHeight).
    // overflowBottom = 1002 - 800 = 202px.
    // initial topOffset = itemRect.top (650) - rootRect.top (500) = 150px.
    // Adjusted topOffset = Math.max(0, 150 - 202 - 10) = 0px.
    vi.spyOn(rootElement, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      left: 100,
      right: 300,
      bottom: 800,
      width: 200,
      height: 300,
      x: 100,
      y: 500,
      toJSON: () => {}
    });

    vi.spyOn(parentContainer, 'getBoundingClientRect').mockReturnValue({
      top: 650,
      left: 100,
      right: 300,
      bottom: 680,
      width: 200,
      height: 30,
      x: 100,
      y: 650,
      toJSON: () => {}
    });

    fireEvent.mouseEnter(parentContainer);

    const submenu = screen.getByTestId('flyout-submenu');
    expect(submenu).toBeDefined();
    // top is adjusted upwards to 0px
    expect(submenu.style.top).toBe('0px');
  });

  it('dismisses submenu when parent menu surface scrolls', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [{ label: 'Chill Vibes', handlerFunction: vi.fn() }]
    };

    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;
    const menuSurface = container.querySelector('.main-menu-surface') as HTMLElement;

    // Hover in -> opens submenu
    fireEvent.mouseEnter(parentContainer);
    expect(screen.getByTestId('flyout-submenu')).toBeDefined();

    // Scroll parent menu surface
    fireEvent.scroll(menuSurface);

    // Submenu is immediately dismissed
    expect(screen.queryByTestId('flyout-submenu')).toBeNull();
  });

  it('keeps submenu open when scrolling inside the submenu itself', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [
        { label: 'Playlist 1', handlerFunction: vi.fn() },
        { label: 'Playlist 2', handlerFunction: vi.fn() },
        { label: 'Playlist 3', handlerFunction: vi.fn() }
      ]
    };

    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Hover in -> opens submenu
    fireEvent.mouseEnter(parentContainer);
    const submenu = screen.getByTestId('flyout-submenu');
    expect(submenu).toBeDefined();

    // Scroll inside the submenu itself
    fireEvent.scroll(submenu);

    // Submenu remains open
    expect(screen.getByTestId('flyout-submenu')).toBeDefined();
    expect(screen.getByText('Playlist 1')).toBeDefined();
  });

  it('dismisses submenu when window / background scrolls', () => {
    const parentItem: ContextMenuItem = {
      label: 'Include in Playlist',
      iconName: 'playlist_add',
      handlerFunction: null,
      innerContextMenus: [{ label: 'Chill Vibes', handlerFunction: vi.fn() }]
    };

    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <div id="context-menu-root" style={{ width: '200px' }}>
          <div className="main-menu-surface overflow-y-auto">
            <ContextMenuItem {...parentItem} />
          </div>
        </div>
      </AppUpdateContext.Provider>
    );

    const parentContainer = screen
      .getByText('Include in Playlist')
      .closest('.relative') as HTMLElement;

    // Hover in -> opens submenu
    fireEvent.mouseEnter(parentContainer);
    expect(screen.getByTestId('flyout-submenu')).toBeDefined();

    // Scroll window
    fireEvent.scroll(window);

    // Submenu is immediately dismissed
    expect(screen.queryByTestId('flyout-submenu')).toBeNull();
  });
});
