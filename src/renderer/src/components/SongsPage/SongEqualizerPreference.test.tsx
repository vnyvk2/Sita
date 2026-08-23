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

  const renderTestSong = (
    songId: number,
    index = 0,
    trackNo: number | undefined = 1,
    isIndexingSongs = true
  ) =>
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <Song
          songId={songId}
          index={index}
          trackNo={trackNo}
          title={`Test Song ${songId}`}
          duration={180}
          path={`/music/song_${songId}.mp3`}
          isIndexingSongs={isIndexingSongs}
          isAFavorite={false}
        />
      </AppUpdateContext.Provider>
    );

  it('renders animated SoundBarsIndicator in index badge when indexing is enabled and track is current and playing', () => {
    const { container } = renderTestSong(101, 0, 1, true);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(false);

    // Overlay on artwork must not be rendered when indexing pill is present
    expect(container.querySelector('.song-cover-container .sound-bars-indicator')).toBeNull();
  });

  it('renders paused idle SoundBarsIndicator on Song when track is current but paused', () => {
    store.setState((prev) => ({
      ...prev,
      player: { ...prev.player, isCurrentSongPlaying: false }
    }));

    const { container } = renderTestSong(101, 0, 1, true);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(true);
    expect(indicator?.classList.contains('sound-bars--playing')).toBe(false);
  });

  it('renders artwork-positioned dot-matrix equalizer overlay when indexing is disabled and song is playing', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          isSongIndexingEnabled: false,
          showTrackNumberAsSongIndex: false,
          showEqualizerOnTracklist: true
        }
      }
    }));

    // Playing track (current song)
    const { container: playingContainer } = renderTestSong(101, 0, undefined, false);
    // Unplayed track (non-current song)
    const { container: unplayedContainer } = renderTestSong(999, 1, undefined, false);

    // No leading index badge pill should exist for either track
    expect(
      playingContainer.querySelector('.song-cover-and-play-btn-container > div.relative.mx-1')
    ).toBeNull();
    expect(
      unplayedContainer.querySelector('.song-cover-and-play-btn-container > div.relative.mx-1')
    ).toBeNull();

    // Playing track must render equalizer overlay INSIDE song-cover-container
    const coverEqualizer = playingContainer.querySelector(
      '.song-cover-container .sound-bars-indicator'
    );
    expect(coverEqualizer).not.toBeNull();
    expect(coverEqualizer?.classList.contains('sound-bars--playing')).toBe(true);

    // Unplayed track must NOT render any equalizer
    expect(unplayedContainer.querySelector('.sound-bars-indicator')).toBeNull();

    // Equalizer overlay must have pointer-events-none and hover cross-fade classes
    const overlayWrapper = coverEqualizer?.closest('.absolute');
    expect(overlayWrapper?.className).toContain('pointer-events-none');
    expect(overlayWrapper?.className).toContain('group-hover:opacity-0');
    expect(overlayWrapper?.className).toContain('group-focus-within:opacity-0');
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

    const { container } = renderTestSong(101, 0, 1, true);

    expect(container.querySelector('.sound-bars-indicator')).toBeNull();
    expect(container.textContent).toContain('1');
  });

  it('renders classic track number for non-current songs even when equalizer preference is true', () => {
    const { container } = renderTestSong(999, 4, 5, true);

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

    const { container } = renderTestSong(101, 0, 1, true);

    const indicator = container.querySelector('.sound-bars-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator?.classList.contains('sound-bars--paused')).toBe(true);
  });

  // --- Row & Artwork Geometry Invariance Tests ---

  it('maintains strict row and artwork geometry invariance when indexing is disabled', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          isSongIndexingEnabled: false,
          showTrackNumberAsSongIndex: false,
          showEqualizerOnTracklist: true
        }
      }
    }));

    // Playing track (current song)
    const { container: playingContainer } = renderTestSong(101, 0, undefined, false);
    // Unplayed track (non-current song)
    const { container: unplayedContainer } = renderTestSong(999, 1, undefined, false);

    const playingLeadingDiv = playingContainer.querySelector('.song-cover-and-play-btn-container');
    const unplayedLeadingDiv = unplayedContainer.querySelector(
      '.song-cover-and-play-btn-container'
    );

    const playingCoverContainer = playingContainer.querySelector('.song-cover-container');
    const unplayedCoverContainer = unplayedContainer.querySelector('.song-cover-container');

    // Both should maintain the narrow container width class
    expect(playingLeadingDiv?.className).toContain('w-[clamp(4rem,10%,6rem)]!');
    expect(unplayedLeadingDiv?.className).toContain('w-[clamp(4rem,10%,6rem)]!');

    // Artwork containers must maintain identical structural classes
    expect(playingCoverContainer?.className).toBe(unplayedCoverContainer?.className);
  });

  it('maintains strict row and artwork geometry invariance when indexing is enabled', () => {
    // Playing track (current song)
    const { container: playingContainer } = renderTestSong(101, 0, 1, true);
    // Unplayed track (non-current song)
    const { container: unplayedContainer } = renderTestSong(999, 1, 2, true);

    const playingLeadingDiv = playingContainer.querySelector('.song-cover-and-play-btn-container');
    const unplayedLeadingDiv = unplayedContainer.querySelector(
      '.song-cover-and-play-btn-container'
    );

    const playingCoverContainer = playingContainer.querySelector('.song-cover-container');
    const unplayedCoverContainer = unplayedContainer.querySelector('.song-cover-container');

    expect(playingLeadingDiv?.className).not.toContain('w-[clamp(4rem,10%,6rem)]!');
    expect(unplayedLeadingDiv?.className).not.toContain('w-[clamp(4rem,10%,6rem)]!');
    expect(playingLeadingDiv?.className).toContain('w-[clamp(6rem,15%,9rem)]');
    expect(unplayedLeadingDiv?.className).toContain('w-[clamp(6rem,15%,9rem)]');

    // Artwork containers must maintain identical structural classes
    expect(playingCoverContainer?.className).toBe(unplayedCoverContainer?.className);
  });

  // --- Artwork & Hover Invariance Tests ---

  it('leaves artwork undimmed at idle when equalizer is ON, while preserving group-hover dimming classes', () => {
    const { container } = renderTestSong(101, 0, 1, true);
    const img = container.querySelector('img');
    const buttonIcon = container.querySelector('.play-btn-container .icon');

    // Standalone static brightness-50 must not be present
    const classes = img?.className.split(' ') || [];
    expect(classes).not.toContain('brightness-50');

    // Interactive hover/focus classes must remain available
    expect(classes).toContain('group-hover:brightness-50');
    expect(classes).toContain('group-focus-within:brightness-50');

    // Play button icon should not have static text-font-color-white/100
    const iconClasses = buttonIcon?.className.split(' ') || [];
    expect(iconClasses).not.toContain('text-font-color-white/100');
    expect(iconClasses).toContain('group-hover:text-font-color-white/100');
    expect(iconClasses).toContain('group-focus-within:text-font-color-white/100');
  });

  it('applies fallback static brightness-50 and visible play icon when equalizer is OFF during playback', () => {
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

    const { container } = renderTestSong(101, 0, 1, true);
    const img = container.querySelector('img');
    const buttonIcon = container.querySelector('.play-btn-container .icon');

    const imgClasses = img?.className.split(' ') || [];
    expect(imgClasses).toContain('brightness-50');

    const iconClasses = buttonIcon?.className.split(' ') || [];
    expect(iconClasses).toContain('text-font-color-white/100');
  });
});
