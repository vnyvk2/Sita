import type { PlaylistDto } from '@common/collections/dtos';
import type { PlaylistCoverSettings } from '@renderer/types/playlistCover';
import type { MaterializedCoverDraft } from '@renderer/types/playlistCoverDraft';
import {
  reconstructPlaylistCoverSongs,
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

  describe('Custom Collage Invariants & Deep Position Resolution', () => {
    it('should resolve custom song IDs when selected within the first 10 positions', () => {
      const playlist = createMockPlaylist({ itemCount: 20 });
      const songs = Array.from({ length: 20 }, (_, i) =>
        createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
      );

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: [2, 4, 6, 8]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, songs);

      expect(result.artworks).toHaveLength(4);
      expect(result.artworks).toEqual(['cover-2.jpg', 'cover-4.jpg', 'cover-6.jpg', 'cover-8.jpg']);
    });

    it('should resolve custom song IDs when selected beyond the first 10 playlist positions (e.g. Song 26)', () => {
      const playlist = createMockPlaylist({ itemCount: 50 });
      // Reconstructed songs array containing top 10 positions plus appended custom picks
      const top10Songs = Array.from({ length: 10 }, (_, i) =>
        createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
      );
      const customSong26 = createMockMockSongWithArt(26, 'cover-26.jpg');
      const playlistSongs = [...top10Songs, customSong26];

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: [26, 2, 3, 4]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, playlistSongs);

      expect(result.artworks).toHaveLength(4);
      expect(result.artworks).toEqual([
        'cover-26.jpg',
        'cover-2.jpg',
        'cover-3.jpg',
        'cover-4.jpg'
      ]);
    });

    it('should resolve multiple custom song IDs all selected beyond the first 10 positions', () => {
      const playlist = createMockPlaylist({ itemCount: 100 });
      const top10Songs = Array.from({ length: 10 }, (_, i) =>
        createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
      );
      const customSong25 = createMockMockSongWithArt(25, 'cover-25.jpg');
      const customSong30 = createMockMockSongWithArt(30, 'cover-30.jpg');
      const customSong40 = createMockMockSongWithArt(40, 'cover-40.jpg');
      const playlistSongs = [...top10Songs, customSong25, customSong30, customSong40];

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 3,
          songIds: [25, 30, 40]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, playlistSongs);

      expect(result.artworks).toHaveLength(3);
      expect(result.artworks).toEqual(['cover-25.jpg', 'cover-30.jpg', 'cover-40.jpg']);
    });

    it('allows intentional duplicate custom collage slots for the same song', () => {
      const playlist = createMockPlaylist({ itemCount: 20 });
      const songs = Array.from({ length: 20 }, (_, i) =>
        createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
      );

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: [1, 1, 2, 3]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, songs);

      expect(result.artworks).toHaveLength(4);
      expect(result.artworks).toEqual(['cover-1.jpg', 'cover-1.jpg', 'cover-2.jpg', 'cover-3.jpg']);
    });

    it('should ignore unused collage slots marked with 0 and fallback to available playlist songs', () => {
      const playlist = createMockPlaylist({ itemCount: 10 });
      const top10Songs = Array.from({ length: 10 }, (_, i) =>
        createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
      );
      const customSong50 = createMockMockSongWithArt(50, 'cover-50.jpg');
      const playlistSongs = [...top10Songs, customSong50];

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 4,
          songIds: [50, 0, 0, 0]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, playlistSongs);

      expect(result.artworks).toHaveLength(4);
      // Slot 0 is custom 50, remaining 3 slots auto-fill with first unused playlist songs [1, 2, 3]
      expect(result.artworks).toEqual([
        'cover-50.jpg',
        'cover-1.jpg',
        'cover-2.jpg',
        'cover-3.jpg'
      ]);
    });

    it('should resolve correctly when playlist has fewer than 10 total songs', () => {
      const playlist = createMockPlaylist({ itemCount: 2 });
      const songs = [
        createMockMockSongWithArt(101, 'cover-101.jpg'),
        createMockMockSongWithArt(102, 'cover-102.jpg')
      ];

      const settings: PlaylistCoverSettings = {
        version: 1,
        type: 'collage',
        collage: {
          layout: 'grid',
          size: 2,
          songIds: [102, 101]
        }
      };

      const result = resolvePlaylistCover(playlist, settings, songs);

      expect(result.artworks).toHaveLength(2);
      expect(result.artworks).toEqual(['cover-102.jpg', 'cover-101.jpg']);
    });
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

describe('reconstructPlaylistCoverSongs', () => {
  it('should reconstruct songs in exact position order matching collectionEntries', () => {
    const collectionEntries = [{ songId: 1 }, { songId: 2 }, { songId: 3 }];
    const fetchedSongData = [
      createMockMockSongWithArt(3, 'cover-3.jpg'),
      createMockMockSongWithArt(1, 'cover-1.jpg'),
      createMockMockSongWithArt(2, 'cover-2.jpg')
    ];

    const result = reconstructPlaylistCoverSongs(collectionEntries, fetchedSongData);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.songId)).toEqual([1, 2, 3]);
  });

  it('should append custom collage songs that reside beyond the collectionEntries limit (e.g. Song 26 at position 45)', () => {
    const collectionEntries = Array.from({ length: 10 }, (_, i) => ({ songId: i + 1 }));
    const top10Songs = Array.from({ length: 10 }, (_, i) =>
      createMockMockSongWithArt(i + 1, `cover-${i + 1}.jpg`)
    );
    const customSong26 = createMockMockSongWithArt(26, 'cover-26.jpg');
    const fetchedSongData = [...top10Songs, customSong26];

    const settings: PlaylistCoverSettings = {
      version: 1,
      type: 'collage',
      collage: {
        layout: 'grid',
        size: 4,
        songIds: [26, 2, 3, 4]
      }
    };

    const reconstructed = reconstructPlaylistCoverSongs(
      collectionEntries,
      fetchedSongData,
      settings
    );

    // Verify reconstructed array preserves top-10 in order and appends song 26
    expect(reconstructed).toHaveLength(11);
    expect(reconstructed.map((s) => s.songId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 26]);

    // End-to-end: verify resolvePlaylistCover resolves Song 26's artwork in slot 0
    const playlist = createMockPlaylist({ itemCount: 50 });
    const cover = resolvePlaylistCover(playlist, settings, reconstructed);
    expect(cover.artworks[0]).toBe('cover-26.jpg');
  });

  it('should deduplicate custom collage songs that are already in collectionEntries', () => {
    const collectionEntries = [{ songId: 1 }, { songId: 2 }, { songId: 3 }];
    const fetchedSongData = [
      createMockMockSongWithArt(1, 'cover-1.jpg'),
      createMockMockSongWithArt(2, 'cover-2.jpg'),
      createMockMockSongWithArt(3, 'cover-3.jpg')
    ];

    const settings: PlaylistCoverSettings = {
      version: 1,
      type: 'collage',
      collage: {
        layout: 'grid',
        size: 4,
        songIds: [1, 2, 3, 0]
      }
    };

    const result = reconstructPlaylistCoverSongs(collectionEntries, fetchedSongData, settings);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.songId)).toEqual([1, 2, 3]);
  });

  it('should ignore unused slot 0 in collage settings', () => {
    const collectionEntries = [{ songId: 10 }, { songId: 20 }];
    const fetchedSongData = [
      createMockMockSongWithArt(10, 'cover-10.jpg'),
      createMockMockSongWithArt(20, 'cover-20.jpg'),
      createMockMockSongWithArt(99, 'cover-99.jpg')
    ];

    const settings: PlaylistCoverSettings = {
      version: 1,
      type: 'collage',
      collage: {
        layout: 'grid',
        size: 4,
        songIds: [99, 0, 0, 0]
      }
    };

    const result = reconstructPlaylistCoverSongs(collectionEntries, fetchedSongData, settings);

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.songId)).toEqual([10, 20, 99]);
  });

  it('should bypass reconstruction when providedSongs is already supplied', () => {
    const provided = [createMockMockSongWithArt(777, 'cover-777.jpg')];
    const result = reconstructPlaylistCoverSongs([], [], undefined, provided);

    expect(result).toBe(provided);
  });
});

function createMockMockSongWithArt(id: number, art: string): SongData {
  return createMockSong(id, art);
}
