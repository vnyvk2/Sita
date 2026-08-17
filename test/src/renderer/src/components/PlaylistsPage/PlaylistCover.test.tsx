// @vitest-environment jsdom
import type { PlaylistDto } from '@common/collections/dtos';
import PlaylistCover from '@renderer/components/PlaylistsPage/PlaylistCover';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMockSong = (id: number, artworkPath?: string): SongData => ({
  songId: id,
  title: `Song ${id}`,
  artists: [{ artistId: id, name: `Artist ${id}` }],
  duration: 180,
  path: `/path/to/song-${id}.mp3`,
  isBlacklisted: false,
  artworkPaths: artworkPath ? { artworkPath, optimizedArtworkPath: artworkPath } : undefined
});

const createMockPlaylist = (overrides?: Partial<PlaylistDto>): PlaylistDto => ({
  id: 101,
  name: 'Purely Prema - Spotify',
  description: null,
  playlistType: 'user',
  parentId: null,
  itemCount: 4,
  totalDuration: 720,
  isPinned: false,
  artworkPath: null,
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
  ...overrides
});

describe('PlaylistCover Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableArtworkFromSongCovers: true
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders custom static playlist artwork when playlist.artworkPath is present', () => {
    const playlist = createMockPlaylist({
      artworkPath: 'nora://custom-cover.jpg',
      itemCount: 5
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PlaylistCover playlist={playlist} />
      </QueryClientProvider>
    );

    const img = screen.getByAltText('Playlist Cover');
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('nora://custom-cover.jpg');
  });

  it('renders default playlist cover when enableArtworkFromSongCovers is false', () => {
    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          enableArtworkFromSongCovers: false
        }
      }
    }));

    const playlist = createMockPlaylist({ itemCount: 10 });

    render(
      <QueryClientProvider client={queryClient}>
        <PlaylistCover playlist={playlist} />
      </QueryClientProvider>
    );

    const img = screen.getByAltText('Playlist Cover');
    expect(img).toBeDefined();
  });

  it('renders default playlist cover when playlist is empty (itemCount === 0)', () => {
    const playlist = createMockPlaylist({ itemCount: 0 });

    render(
      <QueryClientProvider client={queryClient}>
        <PlaylistCover playlist={playlist} />
      </QueryClientProvider>
    );

    const img = screen.getByAltText('Playlist Cover');
    expect(img).toBeDefined();
  });

  it('renders 2x2 collage when songs are provided in auto mode', () => {
    const playlist = createMockPlaylist({ itemCount: 4 });
    const songs = [
      createMockSong(1, 'cover-1.jpg'),
      createMockSong(2, 'cover-2.jpg'),
      createMockSong(3, 'cover-3.jpg'),
      createMockSong(4, 'cover-4.jpg')
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <PlaylistCover playlist={playlist} songs={songs} />
      </QueryClientProvider>
    );

    const covers = screen.getAllByRole('img');
    expect(covers.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByAltText('Cover 1').getAttribute('src')).toBe('cover-1.jpg');
    expect(screen.getByAltText('Cover 2').getAttribute('src')).toBe('cover-2.jpg');
    expect(screen.getByAltText('Cover 3').getAttribute('src')).toBe('cover-3.jpg');
    expect(screen.getByAltText('Cover 4').getAttribute('src')).toBe('cover-4.jpg');
  });

  it('renders custom collage when explicitly configured in storage', () => {
    const playlist = createMockPlaylist({ id: 202, itemCount: 4 });
    const songs = [
      createMockSong(1, 'cover-1.jpg'),
      createMockSong(2, 'cover-2.jpg'),
      createMockSong(3, 'cover-3.jpg'),
      createMockSong(4, 'cover-4.jpg')
    ];

    vi.spyOn(storage.playlistCoverSettings, 'getSettings').mockReturnValue({
      version: 1,
      type: 'collage',
      collage: {
        layout: 'grid',
        size: 2,
        songIds: [3, 1]
      }
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PlaylistCover playlist={playlist} songs={songs} />
      </QueryClientProvider>
    );

    expect(screen.getByAltText('Cover 1').getAttribute('src')).toBe('cover-3.jpg');
    expect(screen.getByAltText('Cover 2').getAttribute('src')).toBe('cover-1.jpg');
  });
});
