import fs from 'fs/promises';

import { db } from '@main/db/db';
import { deleteAlbum, unlinkSongFromAlbum } from '@main/db/queries/albums';
import { deleteArtist, unlinkSongFromArtist } from '@main/db/queries/artists';
import { getSongByPath, updateSongByPath } from '@main/db/queries/songs';
import { sendMessageToRenderer } from '@main/main';
import { processArtworkFiles } from '@main/other/artworks';
import { libraryScheduler } from '@main/workers/jobScheduler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import manageAlbumsOfParsedSong from '../manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from '../manageArtistsOfParsedSong';
import reParseSong from '../reParseSong';

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn()
  }
}));

vi.mock('@main/db/db', () => ({
  db: {
    transaction: vi.fn()
  }
}));

vi.mock('@main/db/queries/songs', () => ({
  getSongByPath: vi.fn(),
  updateSongByPath: vi.fn()
}));

vi.mock('@main/db/queries/artworks', () => ({
  saveArtworks: vi.fn(),
  syncSongArtworks: vi.fn()
}));

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: null, payloads: null })
}));

vi.mock('../manageAlbumsOfParsedSong', () => ({
  default: vi.fn().mockResolvedValue({ relevantAlbum: { id: 1 }, newAlbum: null })
}));

vi.mock('../manageArtistsOfParsedSong', () => ({
  default: vi.fn().mockResolvedValue({ newArtists: [], relevantArtists: [] })
}));

vi.mock('../manageAlbumArtistOfParsedSong', () => ({
  default: vi.fn().mockResolvedValue({ newAlbumArtists: [], relevantAlbumArtists: [] })
}));

vi.mock('../manageGenresOfParsedSong', () => ({
  default: vi.fn().mockResolvedValue({ newGenres: [], relevantGenres: [] })
}));

vi.mock('@main/db/queries/albums', () => ({
  deleteAlbum: vi.fn(),
  getAlbumArtistIds: vi.fn().mockResolvedValue([]),
  getAlbumSongIds: vi.fn().mockResolvedValue([]),
  unlinkSongFromAlbum: vi.fn()
}));

vi.mock('@main/db/queries/artists', () => ({
  deleteArtist: vi.fn(),
  getArtistAlbumIds: vi.fn().mockResolvedValue([]),
  getArtistSongIds: vi.fn().mockResolvedValue([]),
  unlinkSongFromArtist: vi.fn()
}));

vi.mock('@main/db/queries/genres', () => ({
  deleteGenre: vi.fn(),
  getGenreSongIds: vi.fn().mockResolvedValue([]),
  unlinkSongFromGenre: vi.fn()
}));

vi.mock('@main/workers/jobScheduler', () => ({
  libraryScheduler: {
    requestMaintenance: vi.fn(),
    enqueue: vi.fn()
  }
}));

vi.mock('@main/other/generatePalette', () => ({
  generatePalettes: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

const mockDispose = vi.fn();
vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => ({
      tag: {
        title: 'Updated Title',
        performers: ['Artist Updated'],
        albumArtists: ['Artist Updated'],
        album: 'Album Updated',
        genres: ['Rock'],
        year: 2025,
        pictures: []
      },
      properties: {
        durationMilliseconds: 210000,
        audioSampleRate: 48000,
        audioBitrate: 320,
        audioChannels: 2
      },
      dispose: mockDispose
    }))
  }
}));

describe('reParseSong', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A-2 & A-5: should reparse successfully, dispose native file, and return song object', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 42,
      path: '/music/reparse.mp3',
      title: 'Old Title',
      duration: 200,
      artists: [],
      albums: [],
      genres: [],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      expect(mockDispose).toHaveBeenCalledTimes(1);
      return callback({} as any);
    });

    const result = await reParseSong('/music/reparse.mp3');

    expect(result).toBeDefined();
    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(sendMessageToRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ messageCode: 'SONG_REPARSE_SUCCESS' })
    );
  });

  it('A-5 REGRESSION: should return undefined and emit SONG_REPARSE_FAILED with path on error', async () => {
    vi.mocked(getSongByPath).mockRejectedValue(new Error('Filesystem read failure'));

    const result = await reParseSong('/music/failing.mp3');

    expect(result).toBeUndefined();
    expect(sendMessageToRenderer).toHaveBeenCalledWith({
      messageCode: 'SONG_REPARSE_FAILED',
      data: { path: '/music/failing.mp3' }
    });
  });

  it('enqueues targeted PaletteJob for newly created or updated artwork', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 42,
      path: '/music/reparse.mp3',
      title: 'Updated Title',
      duration: 200,
      artists: [],
      albums: [],
      genres: [],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(processArtworkFiles).mockResolvedValue({
      existing: [
        { id: 76, path: '/artwork/full.webp', isOptimized: false },
        { id: 77, path: '/artwork/thumb.webp', isOptimized: true }
      ] as any,
      payloads: undefined
    });

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({} as any);
    });

    await reParseSong('/music/reparse.mp3');

    expect(libraryScheduler.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'palette',
        artworkId: 77,
        artworkPath: '/artwork/thumb.webp',
        id: 'palette_77'
      })
    );
  });

  it('preserves user manual language override during reparse', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 42,
      path: '/music/Telugu/reparse.mp3',
      title: 'Updated Title',
      duration: 200,
      artists: [],
      albums: [],
      genres: [],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    const mockTrx = {
      query: {
        metadataOverrides: {
          findFirst: vi.fn().mockResolvedValue({ stringValue: 'Tamil' })
        }
      }
    };

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback(mockTrx);
    });

    await reParseSong('/music/Telugu/reparse.mp3');

    expect(updateSongByPath).toHaveBeenCalledWith(
      '/music/Telugu/reparse.mp3',
      expect.objectContaining({
        language: 'Tamil'
      }),
      mockTrx
    );
  });

  it('DEF-SCN-02: preserves single-track artist and album without premature unlinking or deletion', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 101,
      path: '/music/comfortably_numb.mp3',
      title: 'Comfortably Numb',
      duration: 380,
      artists: [{ artist: { id: 7, name: 'Pink Floyd' } }],
      albums: [{ album: { id: 9, title: 'The Wall', isFavorite: true } }],
      genres: [{ genre: { id: 3, name: 'Rock' } }],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(manageAlbumsOfParsedSong).mockResolvedValue({
      relevantAlbum: { id: 9, title: 'The Wall' } as any,
      newAlbum: undefined,
      relevantAlbumArtists: []
    });

    vi.mocked(manageArtistsOfParsedSong).mockResolvedValue({
      relevantArtists: [{ id: 7, name: 'Pink Floyd' } as any],
      newArtists: []
    });

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({} as any);
    });

    const result = await reParseSong('/music/comfortably_numb.mp3');

    expect(result).toBeDefined();
    // Neither artist nor album should be unlinked or deleted
    expect(unlinkSongFromAlbum).not.toHaveBeenCalled();
    expect(deleteAlbum).not.toHaveBeenCalled();
    expect(unlinkSongFromArtist).not.toHaveBeenCalled();
    expect(deleteArtist).not.toHaveBeenCalled();
  });

  it('DEF-SCN-02: does not delete artist if still linked to albums as album artist', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 102,
      path: '/music/compilation_track.mp3',
      title: 'Compilation Track',
      duration: 200,
      artists: [{ artist: { id: 8, name: 'Various Artists' } }],
      albums: [{ album: { id: 10, title: 'Summer Hits', isFavorite: true } }],
      genres: [],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(manageAlbumsOfParsedSong).mockResolvedValue({
      relevantAlbum: { id: 10, title: 'Summer Hits' } as any,
      newAlbum: undefined,
      relevantAlbumArtists: []
    });

    // Performer changed from 'Various Artists' to 'Solo Performer' (ID 99)
    vi.mocked(manageArtistsOfParsedSong).mockResolvedValue({
      relevantArtists: [{ id: 99, name: 'Solo Performer' } as any],
      newArtists: []
    });

    // 0 remaining performer songs, BUT still 1 album artist link
    const { getArtistSongIds, getArtistAlbumIds, deleteArtist } = await import('@main/db/queries/artists');
    vi.mocked(getArtistSongIds).mockResolvedValue([]);
    vi.mocked(getArtistAlbumIds).mockResolvedValue([10]); // Still linked as album artist!

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({} as any);
    });

    const result = await reParseSong('/music/compilation_track.mp3');

    expect(result).toBeDefined();
    // Artist 8 was unlinked from song performer
    expect(unlinkSongFromArtist).toHaveBeenCalledWith(8, 102, expect.anything());
    // But artist 8 must NOT be deleted because it is still an album artist!
    expect(deleteArtist).not.toHaveBeenCalledWith(8, expect.anything());
  });

  it('DEF-SCN-02: cleans up orphaned album artist when album is deleted and artist has no other songs or albums', async () => {
    vi.mocked(getSongByPath).mockResolvedValue({
      id: 103,
      path: '/music/album_change.mp3',
      title: 'Album Change Track',
      duration: 210,
      artists: [{ artist: { id: 20, name: 'Solo Singer' } }],
      albums: [{ album: { id: 50, title: 'Old Album' } }],
      genres: [],
      artworks: []
    } as any);

    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    // Track moved to New Album (ID 51)
    vi.mocked(manageAlbumsOfParsedSong).mockResolvedValue({
      relevantAlbum: { id: 51, title: 'New Album' } as any,
      newAlbum: undefined,
      relevantAlbumArtists: []
    });

    vi.mocked(manageArtistsOfParsedSong).mockResolvedValue({
      relevantArtists: [{ id: 20, name: 'Solo Singer' } as any],
      newArtists: []
    });

    const { getAlbumSongIds, getAlbumArtistIds, deleteAlbum } = await import('@main/db/queries/albums');
    const { getArtistSongIds, getArtistAlbumIds, deleteArtist } = await import('@main/db/queries/artists');

    // Old album (50) has 0 remaining songs
    vi.mocked(getAlbumSongIds).mockResolvedValue([]);
    // Old album (50) had Album Artist ID 99 ("Former Producer")
    vi.mocked(getAlbumArtistIds).mockResolvedValue([99]);

    // Artist 99 has no other songs and no other albums left
    vi.mocked(getArtistSongIds).mockResolvedValue([]);
    vi.mocked(getArtistAlbumIds).mockResolvedValue([]);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({} as any);
    });

    const result = await reParseSong('/music/album_change.mp3');

    expect(result).toBeDefined();
    // Old album was deleted
    expect(deleteAlbum).toHaveBeenCalledWith(50, expect.anything());
    // Orphaned album artist 99 was deleted
    expect(deleteArtist).toHaveBeenCalledWith(99, expect.anything());
  });
});

