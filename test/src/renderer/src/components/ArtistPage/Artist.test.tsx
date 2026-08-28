/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Artist } from '../../../../../../src/renderer/src/components/ArtistPage/Artist';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any) => {
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate
}));

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: (props: any) => <img alt="artist cover" data-testid="artist-img" {...props} />
}));

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, className, onClick, onContextMenu, ...rest }: any) => (
    <div data-testid="nav-link" className={className} onClick={onClick} onContextMenu={onContextMenu} {...rest}>
      {children}
    </div>
  )
}));

describe('Artist Component Favorite & Action Overlay', () => {
  const toggleLikeArtistsMock = vi.fn();
  const getSongInfoMock = vi.fn();
  const createQueueMock = vi.fn();
  const updateContextMenuDataMock = vi.fn();

  const mockContextValue: Partial<AppUpdateContextType> = {
    createQueue: createQueueMock,
    updateContextMenuData: updateContextMenuDataMock,
    addNewNotifications: vi.fn(),
    toggleMultipleSelections: vi.fn(),
    updateMultipleSelections: vi.fn(),
    updateQueueData: vi.fn()
  };

  const defaultProps = {
    index: 0,
    artistId: 101,
    name: 'Radiohead',
    artworkPaths: {
      artworkPath: 'path/to/artist.jpg',
      optimizedArtworkPath: 'path/to/artist_opt.jpg'
    },
    songIds: [1, 2, 3],
    isAFavorite: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).api = {
      artistsData: {
        toggleLikeArtists: toggleLikeArtistsMock.mockResolvedValue({ likes: [101], dislikes: [] }),
        getArtistData: vi.fn().mockResolvedValue({ data: [] })
      },
      audioLibraryControls: {
        getSongInfo: getSongInfoMock.mockResolvedValue([
          { songId: 1, title: 'Song 1', isBlacklisted: false },
          { songId: 2, title: 'Song 2', isBlacklisted: false },
          { songId: 3, title: 'Song 3', isBlacklisted: false }
        ])
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders artist name and artwork', () => {
    render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    expect(screen.getByText('Radiohead')).toBeDefined();
    expect(screen.getByTestId('artist-img')).toBeDefined();
  });

  it('renders inactive favorite button when isAFavorite is false', () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={false} />
      </AppUpdateContext.Provider>
    );

    const favoriteIcon = container.querySelector('.material-icons-round-outlined');
    expect(favoriteIcon).not.toBeNull();
    expect(favoriteIcon?.textContent).toBe('favorite');
  });

  it('renders active favorite button with highlight token when isAFavorite is true', () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={true} />
      </AppUpdateContext.Provider>
    );

    const activeFavoriteIcon = container.querySelector('.text-font-color-favorite\\!');
    expect(activeFavoriteIcon).not.toBeNull();
    expect(activeFavoriteIcon?.textContent).toBe('favorite');
  });

  it('toggles favorite on clicking favorite button without navigating', async () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={false} />
      </AppUpdateContext.Provider>
    );

    const favoriteButton = container.querySelector('button[title="common.like"]');
    expect(favoriteButton).not.toBeNull();

    await act(async () => {
      fireEvent.click(favoriteButton!);
    });

    expect(toggleLikeArtistsMock).toHaveBeenCalledWith([101], true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to artist info page on clicking card body', async () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={false} />
      </AppUpdateContext.Provider>
    );

    const artistCard = container.querySelector('.artist');
    expect(artistCard).not.toBeNull();

    await act(async () => {
      fireEvent.click(artistCard!);
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/main-player/artists/$artistId',
      params: { artistId: '101' }
    });
  });

  it('plays artist songs on clicking play button without navigating', async () => {
    const { container } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} />
      </AppUpdateContext.Provider>
    );

    const playCircleIcon = Array.from(container.querySelectorAll('.material-icons-round')).find(
      (el) => el.textContent === 'play_circle'
    );
    expect(playCircleIcon).toBeDefined();

    const playBtn = playCircleIcon?.closest('button');
    expect(playBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(playBtn!);
    });

    expect(getSongInfoMock).toHaveBeenCalledWith([1, 2, 3], undefined, undefined, undefined, true);
    expect(createQueueMock).toHaveBeenCalledWith(
      [1, 2, 3],
      'artist',
      false,
      101,
      true,
      'Radiohead'
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('updates state when props.isAFavorite changes', () => {
    const { container, rerender } = render(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={false} />
      </AppUpdateContext.Provider>
    );

    expect(container.querySelector('.text-font-color-favorite\\!')).toBeNull();

    rerender(
      <AppUpdateContext.Provider value={mockContextValue as any}>
        <Artist {...defaultProps} isAFavorite={true} />
      </AppUpdateContext.Provider>
    );

    expect(container.querySelector('.text-font-color-favorite\\!')).not.toBeNull();
  });
});
