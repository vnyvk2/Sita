// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppUpdateContext, type AppUpdateContextType } from '../../contexts/AppUpdateContext';
import { SongPreferencesProvider } from '../../contexts/SongPreferencesContext';
import { store } from '../../store/store';
import Song from './Song';
import SongRowSkeleton from './SongRowSkeleton';

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

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => (options?.count as string) ?? key
    })
  };
});

describe('Song Row Density & Dispatcher', () => {
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
    toggleSongPlayback: vi.fn(),
    handleSkipBackwardClick: vi.fn(),
    handleSkipForwardClick: vi.fn()
  } as unknown as AppUpdateContextType;

  beforeEach(() => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: undefined as unknown as AudioPlayerData,
      player: {
        ...prev.player,
        isCurrentSongPlaying: false
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          showEqualizerOnTracklist: true,
          isSongIndexingEnabled: true
        }
      },
      multipleSelectionsData: {
        isEnabled: false,
        selectionType: 'songs',
        multipleSelections: []
      }
    }));
  });

  const baseSongProps = {
    songId: 101,
    index: 0,
    trackNo: 1,
    title: 'Test Symphony',
    duration: 215,
    path: '/music/test.mp3',
    isIndexingSongs: true,
    isAFavorite: false,
    artists: [{ artistId: 1, name: 'Composer' }],
    album: { albumId: 2, name: 'Opus 1' },
    artworkPaths: {
      artworkPath: '/art/101.jpg',
      optimizedArtworkPath: '/art/101_opt.jpg',
      isDefaultArtwork: false
    }
  };

  const renderSong = (props: Partial<typeof baseSongProps> & { isCompact?: boolean; rowSize?: 'normal' | 'small' }) =>
    render(
      <AppUpdateContext.Provider value={mockContextValue}>
        <SongPreferencesProvider>
          <Song {...baseSongProps} {...props} />
        </SongPreferencesProvider>
      </AppUpdateContext.Provider>
    );

  describe('Dispatcher routing', () => {
    it('renders CompactSongRow when isCompact is true', () => {
      const { container } = renderSong({ isCompact: true });
      expect(container.querySelector('.compact-song-row')).not.toBeNull();
      expect(container.querySelector('.small-song-row')).toBeNull();
      expect(container.querySelector('.song-item')).toBeNull();
    });

    it('renders SmallSongRow when isCompact is false and rowSize is "small"', () => {
      const { container } = renderSong({ isCompact: false, rowSize: 'small' });
      expect(container.querySelector('.small-song-row')).not.toBeNull();
      expect(container.querySelector('.compact-song-row')).toBeNull();
    });

    it('renders StandardSongRow when isCompact is false and rowSize is "normal" (default)', () => {
      const { container } = renderSong({ isCompact: false, rowSize: 'normal' });
      expect(container.querySelector('.song-item')).not.toBeNull();
      expect(container.querySelector('.compact-song-row')).toBeNull();
      expect(container.querySelector('.small-song-row')).toBeNull();
    });
  });

  describe('Strict Artwork Invariant', () => {
    it('guarantees CompactSongRow contains ZERO img elements (no artwork decode)', () => {
      const { container } = renderSong({ isCompact: true });
      const imgElements = container.querySelectorAll('img');
      expect(imgElements.length).toBe(0);
    });

    it('renders thumbnail img in SmallSongRow and StandardSongRow', () => {
      const { container: smallContainer } = renderSong({ isCompact: false, rowSize: 'small' });
      expect(smallContainer.querySelectorAll('img').length).toBeGreaterThan(0);

      const { container: standardContainer } = renderSong({ isCompact: false, rowSize: 'normal' });
      expect(standardContainer.querySelectorAll('img').length).toBeGreaterThan(0);
    });
  });

  describe('Multiple selection checkbox parity', () => {
    beforeEach(() => {
      store.setState((prev) => ({
        ...prev,
        multipleSelectionsData: {
          isEnabled: true,
          selectionType: 'songs',
          multipleSelections: []
        }
      }));
    });

    it('renders checkbox across Compact, Small, and Normal rows when selection is enabled', () => {
      const { container: compact } = renderSong({ isCompact: true });
      expect(compact.querySelector('input[type="checkbox"]')).not.toBeNull();

      const { container: small } = renderSong({ isCompact: false, rowSize: 'small' });
      expect(small.querySelector('input[type="checkbox"]')).not.toBeNull();

      const { container: standard } = renderSong({ isCompact: false, rowSize: 'normal' });
      expect(standard.querySelector('input[type="checkbox"]')).not.toBeNull();
    });
  });

  describe('SongRowSkeleton tier styling', () => {
    it('renders 38px compact skeleton when isCompact is true', () => {
      const { container } = render(<SongRowSkeleton index={0} isCompact={true} />);
      const skeleton = container.querySelector('.compact-song-skeleton');
      expect(skeleton).not.toBeNull();
      expect(skeleton?.getAttribute('style')).toContain('height: 38px');
    });

    it('renders 48px small skeleton when rowSize is "small"', () => {
      const { container } = render(<SongRowSkeleton index={0} isCompact={false} rowSize="small" />);
      const skeleton = container.querySelector('.small-song-skeleton');
      expect(skeleton).not.toBeNull();
      expect(skeleton?.getAttribute('style')).toContain('height: 48px');
    });

    it('renders 60px standard skeleton when rowSize is "normal"', () => {
      const { container } = render(<SongRowSkeleton index={0} isCompact={false} rowSize="normal" />);
      const skeleton = container.querySelector('.song-item');
      expect(skeleton).not.toBeNull();
    });
  });
});
