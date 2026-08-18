import { describe, expect, it, vi } from 'vitest';
import { TagWriterService } from '../TagWriterService';
import * as withFileHandleModule from '../../../utils/withFileHandle';

describe('TagWriterService — Album Artist & Physical Tag Integrity', () => {
  it('preserves strict separation between albumArtist and track artist (performers)', async () => {
    const service = new TagWriterService();

    let savedFileTag: any = null;
    let savedCalled = false;

    vi.spyOn(withFileHandleModule, 'withFileHandle').mockImplementation(async (_path, fn) => {
      const mockFile = {
        tag: {
          title: '',
          performers: [] as string[],
          albumArtists: [] as string[],
          album: '',
          genres: [] as string[],
          year: 0,
          track: 0,
          disc: 0
        },
        save: () => {
          savedCalled = true;
          savedFileTag = { ...mockFile.tag };
        }
      };
      return await fn(mockFile as any);
    });

    const payload = {
      filePath: 'C:/Music/Compilation/01.mp3',
      title: 'Track 1',
      artist: 'Artist A',
      albumArtist: 'Various Artists',
      album: 'Top Hits 2026',
      year: 2026,
      genre: 'Pop'
    };

    const res = await service.writeTags(payload);

    expect(res.success).toBe(true);
    expect(savedCalled).toBe(true);
    expect(savedFileTag.performers).toEqual(['Artist A']);
    expect(savedFileTag.albumArtists).toEqual(['Various Artists']);
    expect(savedFileTag.performers).not.toEqual(savedFileTag.albumArtists);
    expect(savedFileTag.album).toBe('Top Hits 2026');
    expect(savedFileTag.year).toBe(2026);
  });

  it('does NOT silently derive albumArtist from artist when albumArtist is undefined', async () => {
    const service = new TagWriterService();

    let savedFileTag: any = null;

    vi.spyOn(withFileHandleModule, 'withFileHandle').mockImplementation(async (_path, fn) => {
      const mockFile = {
        tag: {
          title: '',
          performers: [] as string[],
          albumArtists: ['Existing Album Artist'] as string[],
          album: ''
        },
        save: () => {
          savedFileTag = { ...mockFile.tag };
        }
      };
      return await fn(mockFile as any);
    });

    const payload = {
      filePath: 'C:/Music/01.mp3',
      title: 'Solo Track',
      artist: 'Solo Artist'
      // albumArtist is deliberately undefined
    };

    const res = await service.writeTags(payload);

    expect(res.success).toBe(true);
    expect(savedFileTag.performers).toEqual(['Solo Artist']);
    // Existing albumArtists must NOT be overwritten or replaced with payload.artist
    expect(savedFileTag.albumArtists).toEqual(['Existing Album Artist']);
  });
});
