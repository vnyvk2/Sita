import { describe, expect, it, vi } from 'vitest';

import * as atomicModule from '../../../utils/withAtomicFileWrite';
import { TagWriterService } from '../TagWriterService';

describe('TagWriterService — Album Artist & Physical Tag Integrity', () => {
  it('preserves strict separation between albumArtist and track artist (performers)', async () => {
    const service = new TagWriterService();

    let savedFileTag: any = null;
    let savedCalled = false;

    vi.spyOn(atomicModule, 'withAtomicFileWrite').mockImplementation(async (_path, fn) => {
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
      const __result = await fn(mockFile as any);
      mockFile.save();
      return __result;
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

    vi.spyOn(atomicModule, 'withAtomicFileWrite').mockImplementation(async (_path, fn) => {
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
      const __result = await fn(mockFile as any);
      mockFile.save();
      return __result;
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

  it('clears tags for null/empty values but leaves undefined fields untouched (rollback semantics)', async () => {
    const service = new TagWriterService();

    let savedFileTag: any = null;

    vi.spyOn(atomicModule, 'withAtomicFileWrite').mockImplementation(async (_path, fn) => {
      const mockFile = {
        tag: {
          title: 'Old Title',
          performers: ['Old Artist'],
          albumArtists: [] as string[],
          album: 'Old Album',
          genres: ['Old Genre'],
          year: 1999,
          track: 3,
          disc: 1
        },
        save: () => {
          savedFileTag = { ...mockFile.tag };
        }
      };
      const __result = await fn(mockFile as any);
      mockFile.save();
      return __result;
    });

    const payload = {
      filePath: 'C:/Music/rollback.mp3',
      title: '', // '' = explicit clear
      artist: null, // null = explicit clear
      genre: null, // previously-absent genre restored as clear
      year: null as unknown as number, // previously-absent year restored as clear
      album: undefined, // untouched
      trackNumber: undefined // untouched
    };

    const res = await service.writeTags(payload);

    expect(res.success).toBe(true);
    expect(savedFileTag.title).toBe('');
    expect(savedFileTag.performers).toEqual([]);
    expect(savedFileTag.genres).toEqual([]);
    expect(savedFileTag.year).toBe(0);
    // undefined fields keep their prior on-disk values
    expect(savedFileTag.album).toBe('Old Album');
    expect(savedFileTag.track).toBe(3);
  });

  it('handles musicBrainzRecordingId (UFID) and isrc (TSRC) safely across absent, replace, and clear', async () => {
    const service = new TagWriterService();

    let savedFileTag: any = null;

    vi.spyOn(atomicModule, 'withAtomicFileWrite').mockImplementation(async (_path, fn) => {
      const mockFile = {
        tag: {
          title: 'Track',
          performers: [] as string[],
          albumArtists: [] as string[],
          album: '',
          genres: [] as string[],
          year: 0,
          track: 0,
          disc: 0,
          musicBrainzTrackId: undefined as string | undefined,
          isrc: undefined as string | undefined
        },
        save: () => {
          savedFileTag = { ...mockFile.tag };
        }
      };
      const __result = await fn(mockFile as any);
      mockFile.save();
      return __result;
    });

    // 1. Write new MBID and ISRC onto virgin tags (absent -> write new)
    const writeRes = await service.writeTags({
      filePath: 'C:/Music/test.mp3',
      musicBrainzRecordingId: 'mbid-uuid-1',
      isrc: 'USRC12345678'
    });
    expect(writeRes.success).toBe(true);
    expect(savedFileTag.musicBrainzTrackId).toBe('mbid-uuid-1');
    expect(savedFileTag.isrc).toBe('USRC12345678');

    // 2. Clear request on virgin tags (absent -> clear does not throw)
    const clearAbsentRes = await service.writeTags({
      filePath: 'C:/Music/test.mp3',
      musicBrainzRecordingId: '',
      isrc: ''
    });
    expect(clearAbsentRes.success).toBe(true);

    // 3. Replace existing MBID and ISRC
    vi.spyOn(atomicModule, 'withAtomicFileWrite').mockImplementation(async (_path, fn) => {
      const mockFile = {
        tag: {
          title: 'Track',
          performers: [] as string[],
          albumArtists: [] as string[],
          album: '',
          genres: [] as string[],
          year: 0,
          track: 0,
          disc: 0,
          musicBrainzTrackId: 'mbid-uuid-1',
          isrc: 'USRC12345678'
        },
        save: () => {
          savedFileTag = { ...mockFile.tag };
        }
      };
      const __result = await fn(mockFile as any);
      mockFile.save();
      return __result;
    });

    const replaceRes = await service.writeTags({
      filePath: 'C:/Music/test.mp3',
      musicBrainzRecordingId: 'mbid-uuid-2',
      isrc: 'USRC87654321'
    });
    expect(replaceRes.success).toBe(true);
    expect(savedFileTag.musicBrainzTrackId).toBe('mbid-uuid-2');
    expect(savedFileTag.isrc).toBe('USRC87654321');

    // 4. Clear existing MBID and ISRC
    const clearExistingRes = await service.writeTags({
      filePath: 'C:/Music/test.mp3',
      musicBrainzRecordingId: '',
      isrc: ''
    });
    expect(clearExistingRes.success).toBe(true);
    expect(savedFileTag.musicBrainzTrackId).toBe('');
    expect(savedFileTag.isrc).toBe('');
  });
});
