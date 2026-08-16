import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@db/db';
import { isSongWithPathAvailable, saveSong } from '@db/queries/songs';
import { dataUpdateEvent } from '@main/main';
import { tryToParseSong } from '../parseSong';

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn()
  }
}));

vi.mock('@db/db', () => ({
  db: {
    transaction: vi.fn()
  }
}));

vi.mock('@db/queries/songs', () => ({
  isSongWithPathAvailable: vi.fn(),
  saveSong: vi.fn()
}));

vi.mock('@db/queries/artworks', () => ({
  saveArtworks: vi.fn(),
  linkArtworksToSong: vi.fn()
}));

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ existing: null, payloads: null })
}));

vi.mock('../manageAlbumsOfParsedSong', () => ({
  default: vi.fn().mockResolvedValue({ relevantAlbum: null, newAlbum: null })
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

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => ({
      tag: {
        title: 'Single Event Track',
        performers: ['Artist A'],
        albumArtists: ['Artist A'],
        album: 'Album A',
        genres: ['Rock'],
        year: 2024,
        pictures: []
      },
      properties: {
        durationMilliseconds: 200000,
        audioSampleRate: 44100,
        audioBitrate: 320,
        audioChannels: 2
      },
      dispose: vi.fn()
    }))
  }
}));

describe('parseSong event emission deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A-4 REGRESSION: should emit songs/newSong event exactly once with song ID array', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(isSongWithPathAvailable).mockResolvedValue(false);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      vi.mocked(saveSong).mockResolvedValue({ id: 555, title: 'Single Event Track' } as any);
      return callback({} as any);
    });

    await tryToParseSong('/music/single-event.mp3');

    // Verify songs/newSong was called exactly once with the song ID [555]
    const songEventCalls = vi.mocked(dataUpdateEvent).mock.calls.filter(
      (call) => call[0] === 'songs/newSong'
    );

    expect(songEventCalls).toHaveLength(1);
    expect(songEventCalls[0]).toEqual(['songs/newSong', [555]]);
  });
});
