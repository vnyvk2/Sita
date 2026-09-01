// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TheatreLyricsView from '../../../../../../src/renderer/src/components/LyricsPage/TheatreLyricsView';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

describe('TheatreLyricsView', () => {
  const mockClose = vi.fn();
  const mockToggleAutoScrolling = vi.fn();
  const mockEditLyrics = vi.fn();
  const mockResetLyrics = vi.fn();

  const mockContextValues: Partial<AppUpdateContextType> = {
    toggleSongPlayback: vi.fn(),
    handleSkipBackwardClick: vi.fn(),
    handleSkipForwardClick: vi.fn(),
    toggleQueueShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleIsFavorite: vi.fn(),
    toggleMutedState: vi.fn(),
    updateVolume: vi.fn(),
    updateSongPosition: vi.fn(),
    updatePlayerType: vi.fn(),
    toggleLyricsDrawer: vi.fn()
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 1,
        title: 'Space Oddity',
        artists: [{ artistId: 1, name: 'David Bowie' }],
        duration: 315,
        path: '/music/space-oddity.mp3',
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
      <AppUpdateContext.Provider value={mockContextValues as AppUpdateContextType}>
        <TheatreLyricsView
          lyrics={{
            title: 'Space Oddity',
            source: 'OFFLINE_LYRICS',
            isOfflineLyricsAvailable: true,
            lyrics: {
              isSynced: true,
              unparsedLyrics: '',
              parsedLyrics: [{ originalText: 'Ground Control to Major Tom', start: 0, end: 10 }]
            }
          }}
          lyricsComponents={[<div key="1">Ground Control to Major Tom</div>]}
          isAutoScrolling={true}
          onToggleAutoScrolling={mockToggleAutoScrolling}
          onEditLyrics={mockEditLyrics}
          onResetLyrics={mockResetLyrics}
          onClose={mockClose}
        />
      </AppUpdateContext.Provider>
    );

  it('should render track title in the header and lyrics content', () => {
    renderComponent();
    expect(screen.getAllByText('Space Oddity').length).toBeGreaterThan(0);
    expect(screen.getByText('Ground Control to Major Tom')).toBeDefined();
  });

  it('should trigger onClose when exit theatre button is clicked', () => {
    renderComponent();
    const exitBtn = document.body.querySelector('.exit-theatre-btn') as HTMLButtonElement;
    expect(exitBtn).not.toBeNull();
    fireEvent.click(exitBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('should trigger onClose when Escape key is pressed', () => {
    renderComponent();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
