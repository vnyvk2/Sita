// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../contexts/AppUpdateContext';
import { store } from '../../store/store';
import Song from './Song';

// Mock NavLink to prevent RouterProvider requirement
vi.mock('../NavLink', () => ({
  default: ({
    children,
    className,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a className={className} {...props}>
      {children}
    </a>
  )
}));

// Mock router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

// Mock react-i18next preserving initReactI18next for i18n initialization
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => (options?.count as string) ?? key
    })
  };
});

describe('Song Component Equalizer Preference & Playback State Integration', () => {
  const mockContextValue: AppUpdateContextType = {
    playSong: vi.fn(),
    updateContextMenuData: vi.fn(),
    changePromptMenuData: vi.fn(),
    addNewNotifications: vi.fn(),
    toggleIsFavorite: vi.fn(),
    toggleMultipleSelections: vi.fn(),
    updateMultipleSelections: vi.fn(),
    createQueue: vi.fn(),
    openAutoTagDialog: vi.fn(),
    updateBodyBackgroundImage: vi.fn(),
    updateSongPosition: vi.fn(),
    updateVolume: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleMutedState: vi.fn(),
    changeQueueCurrentSongIndex: vi.fn(),
    reParseSong: vi.fn(),
    toggleMiniPlayer: vi.fn(),
    toggleSongPlayback: vi.fn(),
    skipSong: vi.fn(),
    handleSongPlaybackError: vi.fn(),
    updatePlaybackRate: vi.fn()
  };

  beforeEach(() => {
    // Reset store state before each test
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 101,
        title: 'Playing Song',
        isAFavorite: false
      } as unknown as SongData,
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showEqualizerOnTracklist: true,
          isSongIndexingEnabled: true,
          isReducedMotion: false,
          removeAnimationsOnBatteryPower: false
        }
      },
      isOnBatteryPower: false,
      multipleSelectionsData: {
        isEnabled: false,
        selectionType: 'songs',
        multipleSelections: []
      }
    }));
  });

  const renderTestSong = (songId: number, index = 0, trackNo = 1) =>
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <Song
          songId={songId}
          index={index}
          trackNo={trackNo}
          title={`Test Song ${songId}`}
          duration={180}
          path={`/music/song_${songId}.mp3`}
          isIndexingSongs={true}
          isAFavorite={false}
        />
      </AppUpdateContext.Provider>
    );

  it('renders animated SoundBarsIndicator on the real Song component when track is current and playing', () => {
    const { container } = renderTestSong(101, 0, 1);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(false);
  });

  it('renders paused idle SoundBarsIndicator on Song when track is current but paused', () => {
    store.setState((prev) => ({
      ...prev,
      player: { ...prev.player, isCurrentSongPlaying: false }
    }));

    const { container } = renderTestSong(101, 0, 1);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(false);
  });

  it('reverts to classic track number on Song component when showEqualizerOnTracklist is false', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showEqualizerOnTracklist: false
        }
      }
    }));

    const { container } = renderTestSong(101, 0, 1);

    expect(container.querySelector('.sound-bars-indicator')).toBeNull();
    expect(container.textContent).toContain('1');
  });

  it('renders classic track number for non-current songs even when equalizer preference is true', () => {
    const { container } = renderTestSong(999, 4, 5);

    expect(container.querySelector('.sound-bars-indicator')).toBeNull();
    expect(container.textContent).toContain('5');
  });

  it('switches equalizer to paused idle state when on battery with removeAnimationsOnBatteryPower enabled', () => {
    store.setState((prev) => ({
      ...prev,
      isOnBatteryPower: true,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          removeAnimationsOnBatteryPower: true
        }
      }
    }));

    const { container } = renderTestSong(101, 0, 1);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(true);
  });
});
