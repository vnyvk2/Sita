import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import { getSongByPath, updateSongByPath } from '@main/db/queries/songs';
import { sendMessageToRenderer } from '@main/main';
import { processArtworkFiles } from '@main/other/artworks';
import { libraryScheduler } from '@main/workers/jobScheduler';
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

vi.mock('@main/removeSongsFromLibrary', () => ({
  removeDeletedAlbumDataOfSong: vi.fn(),
  removeDeletedArtistDataOfSong: vi.fn(),
  removeDeletedGenreDataOfSong: vi.fn()
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
      duration: '200',
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
      duration: '200',
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
      duration: '200',
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
});
