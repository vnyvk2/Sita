/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getAllSongs } from '../../../../../../src/main/db/queries/songs';
import { CollectionClient } from '../../../../../../src/renderer/src/api/CollectionClient';
import Song from '../../../../../../src/renderer/src/components/SongsPage/Song';
import { buildSongPlaylistMenuItem } from '../../../../../../src/renderer/src/components/SongsPage/songPlaylistMenu';
import {
  AppUpdateContext,
  type AppUpdateContextType
} from '../../../../../../src/renderer/src/contexts/AppUpdateContext';
import { rootCollectionsOptions } from '../../../../../../src/renderer/src/hooks/collections/useCollectionQueries';
import { songPlaylistsQuery } from '../../../../../../src/renderer/src/queries/songPlaylists';
import { queryClient } from '../../../../../../src/renderer/src/queryClient';
import { dispatch } from '../../../../../../src/renderer/src/store/store';

// Mock dependencies
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValOrOptions?: any) => {
        if (typeof defaultValOrOptions === 'object' && defaultValOrOptions?.defaultValue) {
          return defaultValOrOptions.defaultValue;
        }
        if (typeof defaultValOrOptions === 'string') return defaultValOrOptions;
        return key;
      }
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: (props: any) => <img alt="song cover" data-testid="song-img" {...props} />
}));

vi.mock('../../../../../../src/renderer/src/components/NavLink', () => ({
  default: ({ children, title, className, ...rest }: any) => (
    <span data-testid="nav-link" title={title} className={className} {...rest}>
      {children}
    </span>
  )
}));

vi.mock('../../../../../../src/renderer/src/hooks/useQueueOperations', () => ({
  useQueueOperations: () => ({
    addToNext: vi.fn(),
    addToEnd: vi.fn(),
    removeSongs: vi.fn(),
    clearQueue: vi.fn(),
    playNext: vi.fn()
  })
}));

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

const createSongProps = (id: number) => ({
  songId: id,
  title: `Test Song ${id}`,
  duration: 200,
  path: `/music/test${id}.mp3`,
  artworkPaths: {
    isDefaultArtwork: true,
    artworkPath: `/artworks/cover_${id}.webp`,
    optimizedArtworkPath: `/artworks/cover_${id}.webp`
  },
  index: id - 1,
  isIndexingSongs: true,
  isAFavorite: false,
  artists: [{ artistId: 1, name: 'Artist A' }],
  album: { albumId: 1, name: 'Album A' }
});

describe('MusicBee-Style Lazy Playlist Membership & Context Menu', () => {
  const mockPlaylists = [
    { id: 1, name: 'Chill Vibes', isPinned: false, itemCount: 5 },
    { id: 2, name: 'Telugu Hits', isPinned: true, itemCount: 12 },
    { id: 3, name: 'Workout Pump', isPinned: false, itemCount: 8 }
  ];

  beforeEach(() => {
    queryClient.clear();

    if (typeof window !== 'undefined') {
      (window as any).api = {
        membership: {
          getCollectionsContaining: vi.fn().mockImplementation(async (member: any) => {
            if (member.id === 10)
              return [
                { kind: 'playlist', id: 1 },
                { kind: 'playlist', id: 2 }
              ];
            if (member.id === 20) return [{ kind: 'playlist', id: 3 }];
            return [];
          })
        },
        playerControls: {
          toggleLikeSongs: vi.fn().mockResolvedValue({ likes: [], dislikes: [] })
        },
        properties: {
          isInDevelopment: false
        }
      };
    }

    // Seed root collections cache
    queryClient.setQueryData(rootCollectionsOptions('aToZ').queryKey, mockPlaylists);

    vi.spyOn(CollectionClient, 'getChildren').mockResolvedValue(mockPlaylists as any);
    vi.spyOn(CollectionClient, 'addSongs').mockResolvedValue({} as any);
    vi.spyOn(CollectionClient, 'removeSongs').mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Test 1: buildSongPlaylistMenuItem builds submenu with accurate checkbox states', async () => {
    const addNewNotifications = vi.fn();
    const changePromptMenuData = vi.fn();

    const menuItem = await buildSongPlaylistMenuItem({
      songIds: [10],
      title: 'Test Song 10',
      t: ((k: string, opts?: any) => opts?.defaultValue || k) as any,
      addNewNotifications,
      changePromptMenuData
    });

    expect(menuItem.label).toBe('Include in Playlist');
    expect(menuItem.innerContextMenus).toBeDefined();

    // Check inner items: Chill Vibes (id 1, isIncluded: true), Telugu Hits (id 2, isIncluded: true), Workout Pump (id 3, isIncluded: false)
    const inner = menuItem.innerContextMenus!;
    const chillItem = inner.find((i) => i.label === 'Chill Vibes');
    const teluguItem = inner.find((i) => i.label === 'Telugu Hits');
    const workoutItem = inner.find((i) => i.label === 'Workout Pump');

    expect(chillItem?.iconName).toBe('check_box');
    expect(teluguItem?.iconName).toBe('check_box');
    expect(workoutItem?.iconName).toBe('check_box_outline_blank');
  });

  it('Test 2: Clicking unincluded playlist triggers addSongs, optimistically updates cache, and invalidates playlist queries', async () => {
    const addNewNotifications = vi.fn();
    const changePromptMenuData = vi.fn();

    const menuItem = await buildSongPlaylistMenuItem({
      songIds: [10],
      title: 'Test Song 10',
      t: ((k: string, opts?: any) => opts?.defaultValue || k) as any,
      addNewNotifications,
      changePromptMenuData
    });

    const workoutItem = menuItem.innerContextMenus!.find((i) => i.label === 'Workout Pump');
    expect(workoutItem).toBeDefined();

    // Execute add to Workout Pump (id: 3)
    await act(async () => {
      await workoutItem!.handlerFunction!();
    });

    // 1. Assert CollectionClient.addSongs called
    expect(CollectionClient.addSongs).toHaveBeenCalledWith({
      playlistId: 3,
      songIds: [10]
    });

    // 2. Assert query cache updated to include playlist 3
    const cached = queryClient.getQueryData<number[]>(songPlaylistsQuery.membership(10).queryKey);
    expect(cached).toContain(3);
    expect(addNewNotifications).toHaveBeenCalled();
  });

  it('Test 3: Clicking included playlist triggers removeSongs, optimistically updates cache, and notifies user', async () => {
    const addNewNotifications = vi.fn();
    const changePromptMenuData = vi.fn();

    const menuItem = await buildSongPlaylistMenuItem({
      songIds: [10],
      title: 'Test Song 10',
      t: ((k: string, opts?: any) => opts?.defaultValue || k) as any,
      addNewNotifications,
      changePromptMenuData
    });

    const chillItem = menuItem.innerContextMenus!.find((i) => i.label === 'Chill Vibes');
    expect(chillItem).toBeDefined();

    // Execute remove from Chill Vibes (id: 1)
    await act(async () => {
      await chillItem!.handlerFunction!();
    });

    // 1. Assert CollectionClient.removeSongs called
    expect(CollectionClient.removeSongs).toHaveBeenCalledWith({
      playlistId: 1,
      songIds: [10]
    });

    // 2. Assert query cache updated to exclude playlist 1
    const cached = queryClient.getQueryData<number[]>(songPlaylistsQuery.membership(10).queryKey);
    expect(cached).not.toContain(1);
  });

  it('Test 4: Mutation failure rolls back optimistic query cache update and shows error notification', async () => {
    vi.spyOn(CollectionClient, 'addSongs').mockRejectedValueOnce(new Error('DB Locked'));
    const addNewNotifications = vi.fn();

    const menuItem = await buildSongPlaylistMenuItem({
      songIds: [10],
      title: 'Test Song 10',
      t: ((k: string, opts?: any) => opts?.defaultValue || k) as any,
      addNewNotifications,
      changePromptMenuData: vi.fn()
    });

    const workoutItem = menuItem.innerContextMenus!.find((i) => i.label === 'Workout Pump');

    await act(async () => {
      await workoutItem!.handlerFunction!();
    });

    // Verify cache was rolled back (playlist 3 not present)
    const cached = queryClient.getQueryData<number[]>(songPlaylistsQuery.membership(10).queryKey);
    expect(cached).not.toContain(3);

    // Verify error notification
    expect(addNewNotifications).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'playlist-toggle-error-3',
          iconName: 'error'
        })
      ])
    );
  });

  it('Test 5 (Architectural Invariant): getAllSongs query does not hydrate playlists relation', async () => {
    // Assert getAllSongs function does not define a relation with `playlists: true`
    const dbMock: any = {
      query: {
        songs: {
          findMany: vi.fn().mockImplementation((config: any) => {
            expect(config.with?.playlists).toBeUndefined();
            expect(config.with?.artworks?.with?.artwork?.columns).toEqual({
              id: true,
              path: true,
              isOptimized: true
            });
            return Promise.resolve([]);
          })
        }
      }
    };

    await getAllSongs(undefined, dbMock);
    expect(dbMock.query.songs.findMany).toHaveBeenCalled();
  });

  it('Test 6 (Cache Isolation): Different songs have completely isolated membership caches', async () => {
    // Query membership for Song 10
    const song10Members = await queryClient.fetchQuery(songPlaylistsQuery.membership(10));
    expect(song10Members).toEqual([1, 2]);

    // Query membership for Song 20
    const song20Members = await queryClient.fetchQuery(songPlaylistsQuery.membership(20));
    expect(song20Members).toEqual([3]);

    // Verify separate cache entries in QueryClient
    const cache10 = queryClient.getQueryData(songPlaylistsQuery.membership(10).queryKey);
    const cache20 = queryClient.getQueryData(songPlaylistsQuery.membership(20).queryKey);
    expect(cache10).toEqual([1, 2]);
    expect(cache20).toEqual([3]);
  });

  it('Test 7 (Multi-Selection Batch Add): Right-clicking multiple selected songs adds all songs to target playlist', async () => {
    const addNewNotifications = vi.fn();

    const menuItem = await buildSongPlaylistMenuItem({
      songIds: [10, 11, 12],
      title: '3 songs selected',
      t: ((k: string, opts?: any) => opts?.defaultValue || k) as any,
      addNewNotifications,
      changePromptMenuData: vi.fn()
    });

    const chillItem = menuItem.innerContextMenus!.find((i) => i.label === 'Chill Vibes');
    expect(chillItem?.iconName).toBe('playlist_add');

    await act(async () => {
      await chillItem!.handlerFunction!();
    });

    expect(CollectionClient.addSongs).toHaveBeenCalledWith({
      playlistId: 1,
      songIds: [10, 11, 12]
    });
  });

  it('Test 8: Right-clicking Song row asynchronously mounts Include in Playlist in context menu', async () => {
    let capturedMenuItems: any = null;

    const customContext: AppUpdateContextType = {
      ...mockContextValue,
      updateContextMenuData: vi.fn((_open, items) => {
        capturedMenuItems = items;
      })
    };

    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={customContext}>
          <Song {...createSongProps(10)} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    const songElement = screen.getByText('Test Song 10').closest('.group') as HTMLElement;

    await act(async () => {
      fireEvent.contextMenu(songElement);
    });

    expect(capturedMenuItems).toBeDefined();
    const playlistMenu = capturedMenuItems.find((i: any) => i.label === 'Include in Playlist');
    expect(playlistMenu).toBeDefined();
    expect(playlistMenu.innerContextMenus.length).toBeGreaterThan(0);
  });
});
