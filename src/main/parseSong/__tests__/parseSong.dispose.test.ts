import fs from 'fs/promises';

import { db } from '@db/db';
import { isSongWithPathAvailable, saveSong } from '@db/queries/songs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseSong } from '../parseSong';

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

const mockDispose = vi.fn();
const mockTagLibFile = {
  tag: {
    title: 'Test Track',
    performers: ['Test Artist'],
    albumArtists: ['Test Artist'],
    album: 'Test Album',
    genres: ['Pop'],
    year: 2024,
    disc: 1,
    track: 1,
    pictures: []
  },
  properties: {
    durationMilliseconds: 180000,
    audioSampleRate: 44100,
    audioBitrate: 320,
    audioChannels: 2
  },
  dispose: mockDispose
};

vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => mockTagLibFile)
  }
}));

describe('parseSong native File.dispose() lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A-2 REGRESSION: should call file.dispose() in try/finally on successful parse', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(isSongWithPathAvailable).mockResolvedValue(false);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      // Invariant: file.dispose() must already have been called BEFORE DB transaction starts
      expect(mockDispose).toHaveBeenCalledTimes(1);
      vi.mocked(saveSong).mockResolvedValue({ id: 101, title: 'Test Track' } as any);
      return callback({} as any);
    });

    const res = await parseSong('/music/test.mp3');

    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(res).toBeDefined();
  });

  it('A-2 REGRESSION: should call file.dispose() even if metadata reading fails or throws in DB check', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    vi.mocked(isSongWithPathAvailable).mockRejectedValue(
      new Error('DB failure during eligibility check')
    );

    await expect(parseSong('/music/test.mp3')).rejects.toThrow(
      'DB failure during eligibility check'
    );

    // file.dispose() must still be called via finally block
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('A-2 REGRESSION: should call file.dispose() when native file.tag getter throws corrupted header error', async () => {
    vi.mocked(fs.stat).mockResolvedValue({
      birthtime: new Date(),
      mtime: new Date()
    } as any);

    const corruptMockDispose = vi.fn();
    const corruptFile = {
      get tag(): any {
        throw new Error('Corrupted ID3 header');
      },
      properties: {
        durationMilliseconds: 180000
      },
      dispose: corruptMockDispose
    };

    const { File } = await import('node-taglib-sharp');
    vi.mocked(File.createFromPath).mockReturnValueOnce(corruptFile as any);

    await expect(parseSong('/music/corrupt.mp3')).rejects.toThrow('Corrupted ID3 header');

    // Native file.dispose() must be guaranteed via try/finally block
    expect(corruptMockDispose).toHaveBeenCalledTimes(1);
  });
});
