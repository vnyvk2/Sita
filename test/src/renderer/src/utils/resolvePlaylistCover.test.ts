import type { PlaylistDto } from '@common/collections/dtos';
import type { PlaylistCoverSettings } from '@renderer/types/playlistCover';
import type { MaterializedCoverDraft } from '@renderer/types/playlistCoverDraft';
import {
  resolvePlaylistCover,
  resolvePlaylistCoverFromDraft
} from '@renderer/utils/resolvePlaylistCover';
import { describe, expect, it } from 'vitest';

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
  id: 1,
  name: 'Test Playlist',
  description: null,
  playlistType: 'user',
  parentId: null,
  itemCount: 4,
  totalDuration: 720,
  isPinned: false,
  artworkPath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides
});

describe('resolvePlaylistCover', () => {
  it('should resolve auto cover with 0 songs to empty artworks array', () => {
    const playlist = createMockPlaylist({ itemCount: 0 });
    const result = resolvePlaylistCover(playlist, undefined, []);

    expect(result.layout).toBe('grid');
    expect(result.artworks).toEqual([]);
  });

  it('should resolve auto cover with 1 song to single artwork', () => {
    const playlist = createMockPlaylist({ itemCount: 1 });
    const songs = [createMockMockSongWithArt(1, 'cover-1.jpg')];

    const result = resolvePlaylistCover(playlist, undefined, songs);

    expect(result.layout).toBe('grid');
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0]).toBe('cover-1.jpg');
  });

  it('should resolve auto cover with 2-3 songs to partial collage artworks', () => {
    const playlist = createMockPlaylist({ itemCount: 3 });
    const songs = [
      createMockMockSongWithArt(1, 'cover-1.jpg'),
      createMockMockSongWithArt(2, 'cover-2.jpg'),
      createMockMockSongWithArt(3, 'cover-3.jpg')
    ];

    const result = resolvePlaylistCover(playlist, undefined, songs);

    expect(result.layout).toBe('grid');
    expect(result.artworks).toHaveLength(3);
    expect(result.artworks).toEqual(['cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg']);
  });

  it('should resolve auto cover with 4+ songs to the first 4 artworks', () => {
    const playlist = createMockPlaylist({ itemCount: 10 });
    const songs = Array.from({ length: 10 }, (_, i) =>
      createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
    );

    const result = resolvePlaylistCover(playlist, undefined, songs);

    expect(result.layout).toBe('grid');
    expect(result.artworks).toHaveLength(4);
    expect(result.artworks).toEqual(['cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg', 'cover-4.jpg']);
  });

  it('should prioritize custom static artworkPath when no custom collage is set', () => {
    const playlist = createMockPlaylist({
      artworkPath: 'nora://custom-artwork.jpg',
      itemCount: 10
    });
    const songs = Array.from({ length: 10 }, (_, i) =>
      createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
    );

    const result = resolvePlaylistCover(playlist, { type: 'auto' }, songs);

    expect(result.layout).toBe('grid');
    expect(result.artworks).toEqual(['nora://custom-artwork.jpg']);
  });

  it('should resolve custom collage settings with custom layout and explicit song IDs', () => {
    const playlist = createMockPlaylist({
      artworkPath: 'nora://ignored-due-to-custom-collage.jpg',
      itemCount: 10
    });
    const songs = Array.from({ length: 10 }, (_, i) =>
      createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
    );

    const settings: PlaylistCoverSettings = {
      version: 1,
      type: 'collage',
      collage: {
        layout: 'triangle',
        variant: 'diagonal',
        size: 3,
        songIds: [5, 3, 1]
      }
    };

    const result = resolvePlaylistCover(playlist, settings, songs);

    expect(result.layout).toBe('triangle');
    expect(result.variant).toBe('diagonal');
    expect(result.artworks).toHaveLength(3);
    expect(result.artworks).toEqual(['cover-5.jpg', 'cover-3.jpg', 'cover-1.jpg']);
  });

  it('should fallback fill missing custom collage slots from available playlist songs', () => {
    const playlist = createMockPlaylist({ itemCount: 5 });
    const songs = [
      createMockMockSongWithArt(1, 'cover-1.jpg'),
      createMockMockSongWithArt(2, 'cover-2.jpg'),
      createMockMockSongWithArt(3, 'cover-3.jpg'),
      createMockMockSongWithArt(4, 'cover-4.jpg')
    ];

    const settings: PlaylistCoverSettings = {
      version: 1,
      type: 'collage',
      collage: {
        layout: 'grid',
        size: 4,
        // songId 99 does not exist in playlist; slot 0 should be fallback-filled
        songIds: [99, 2, 3, 4]
      }
    };

    const result = resolvePlaylistCover(playlist, settings, songs);

    expect(result.artworks).toHaveLength(4);
    // Slot 0 falls back to song 1 (first available unused song), remaining slots keep [2, 3, 4]
    expect(result.artworks).toEqual(['cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg', 'cover-4.jpg']);
  });
});

describe('resolvePlaylistCoverFromDraft', () => {
  it('should resolve preview cover directly from materialized draft', () => {
    const songs = [
      createMockMockSongWithArt(10, 'draft-10.jpg'),
      createMockMockSongWithArt(20, 'draft-20.jpg')
    ];

    const draft: MaterializedCoverDraft = {
      type: 'collage',
      layout: 'fan',
      variant: 'standard',
      size: 2,
      slots: [
        { slot: 0, songId: 10, isExplicit: true },
        { slot: 1, songId: 20, isExplicit: true }
      ]
    };

    const result = resolvePlaylistCoverFromDraft(draft, songs);

    expect(result.layout).toBe('fan');
    expect(result.variant).toBe('standard');
    expect(result.artworks).toEqual(['draft-10.jpg', 'draft-20.jpg']);
  });
});

function createMockMockSongWithArt(id: number, art: string): SongData {
  return createMockSong(id, art);
}
