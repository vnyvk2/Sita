// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TheatreLyricsPlayerBar from '../../../../../../src/renderer/src/components/LyricsPage/TheatreLyricsPlayerBar';
import { AppUpdateContext, type AppUpdateContextType } from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { store } from '../../../../../../src/renderer/src/store/store';

describe('TheatreLyricsPlayerBar', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    window.__NORA_AUDIO_PLAYER__ = null;
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 1,
        title: 'Starman',
        artists: [{ artistId: 1, name: 'David Bowie' }],
        duration: 256,
        path: '/music/starman.mp3',
        isAFavorite: false,
        isKnownSource: true,
        isBlacklisted: false
      },
      player: {
        ...prev.player,
        isCurrentSongPlaying: false,
        isShuffling: false,
        isRepeating: 'false',
        isPlayerStalled: false,
        volume: { isMuted: false, value: 75 }
      }
    }));
  });

  afterEach(() => {
    window.__NORA_AUDIO_PLAYER__ = null;
  });

  const renderComponent = () =>
    render(
      <AppUpdateContext.Provider value={mockContextValues as AppUpdateContextType}>
        <TheatreLyricsPlayerBar />
      </AppUpdateContext.Provider>
    );

  it('should render track title and artist name', () => {
    renderComponent();
    expect(screen.getByText('Starman')).toBeDefined();
    expect(screen.getByText('David Bowie')).toBeDefined();
  });

  it('should initialize song position immediately from active AudioPlayer singleton without 00:00 flash', () => {
    window.__NORA_AUDIO_PLAYER__ = {
      currentTime: 90
    } as any;

    renderComponent();
    expect(screen.getAllByText('01:30').length).toBeGreaterThan(0);
  });

  it('should synchronize current song position from player/positionChange event', () => {
    renderComponent();
    expect(screen.getAllByText('00:00').length).toBeGreaterThan(0);

    // Dispatch player/positionChange event at 75 seconds (01:15)
    act(() => {
      document.dispatchEvent(new CustomEvent('player/positionChange', { detail: 75 }));
    });

    expect(screen.getAllByText('01:15').length).toBeGreaterThan(0);
  });

  it('should call toggleSongPlayback when play/pause button is clicked', () => {
    const { container } = renderComponent();
    const playBtn = container.querySelector('.play-pause-btn') as HTMLButtonElement;
    expect(playBtn).not.toBeNull();
    fireEvent.click(playBtn);
    expect(mockContextValues.toggleSongPlayback).toHaveBeenCalledTimes(1);
  });

  it('should call handleSkipForwardClick and handleSkipBackwardClick on skip buttons', () => {
    const { container } = renderComponent();
    const skipNextBtn = container.querySelector('.skip-forward-btn') as HTMLButtonElement;
    const skipPrevBtn = container.querySelector('.skip-back-btn') as HTMLButtonElement;

    fireEvent.click(skipNextBtn);
    expect(mockContextValues.handleSkipForwardClick).toHaveBeenCalledWith('USER_SKIP');

    fireEvent.click(skipPrevBtn);
    expect(mockContextValues.handleSkipBackwardClick).toHaveBeenCalledTimes(1);
  });

  it('should call toggleQueueShuffle on shuffle click', () => {
    const { container } = renderComponent();
    const shuffleBtn = container.querySelector('.shuffle-btn') as HTMLButtonElement;
    expect(shuffleBtn).not.toBeNull();
    fireEvent.click(shuffleBtn);
    expect(mockContextValues.toggleQueueShuffle).toHaveBeenCalledTimes(1);
  });
});
