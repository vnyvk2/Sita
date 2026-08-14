// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FocusedLyricsView from '../../../../../../src/renderer/src/components/LyricsPage/FocusedLyricsView';
import { AppUpdateContext, type AppUpdateContextType } from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

describe('FocusedLyricsView', () => {
  const mockOnClose = vi.fn();
  const mockOnToggleAutoScrolling = vi.fn();
  const mockOnEditLyrics = vi.fn();

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
    updatePlayerType: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 1,
        title: 'Space Oddity',
        artists: [{ artistId: 1, name: 'David Bowie' }],
        duration: 315,
        path: '/music/space_oddity.mp3',
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

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () =>
    render(
      <AppUpdateContext.Provider value={mockContextValues as AppUpdateContextType}>
        <FocusedLyricsView
          lyrics={{
            source: 'IN_SONG_LYRICS',
            isOfflineLyricsAvailable: true,
            lyrics: {
              isSynced: true,
              isTranslated: false,
              isRomanized: false,
              isReset: false,
              parsedLyrics: [{ originalText: 'Ground Control to Major Tom', isEnhancedSynced: false }]
            }
          }}
          lyricsComponents={[
            <div key={0} data-testid="lyric-line">
              Ground Control to Major Tom
            </div>
          ]}
          onClose={mockOnClose}
          onToggleAutoScrolling={mockOnToggleAutoScrolling}
          onEditLyrics={mockOnEditLyrics}
        />
      </AppUpdateContext.Provider>
    );

  it('should render header with track info and lyrics lines', () => {
    renderComponent();
    expect(screen.getAllByText('Space Oddity').length).toBeGreaterThan(0);
    expect(screen.getByTestId('lyric-line')).toBeDefined();
  });

  it('should call onClose when back/collapse button is clicked', () => {
    const { container } = renderComponent();
    const collapseBtn = container.querySelector('.collapse-lyrics-btn') as HTMLButtonElement;
    expect(collapseBtn).not.toBeNull();
    fireEvent.click(collapseBtn);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Escape key is pressed', () => {
    renderComponent();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
