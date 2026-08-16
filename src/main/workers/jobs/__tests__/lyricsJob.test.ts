import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import { getSongById } from '@main/db/queries/songs';
import fetchLyricsFromLrclib from '@main/utils/fetchLyricsFromLrclib';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { CURRENT_LYRICS_GENERATOR_VERSION, LyricsJob } from '../lyricsJob';

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn()
  }
}));

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      lyrics: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

vi.mock('@main/db/queries/songs', () => ({
  getSongById: vi.fn()
}));

vi.mock('@main/utils/fetchLyricsFromLrclib', () => ({
  default: vi.fn()
}));

vi.mock('@main/utils/fetchLyricsFromMusixmatch', () => ({
  default: vi.fn()
}));

const mockDispose = vi.fn();
vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => ({
      tag: {
        lyrics: '[00:01.00] Embedded Lyrics Line'
      },
      dispose: mockDispose
    }))
  }
}));

describe('LyricsJob', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('should skip if lyrics already exist and are up to date', async () => {
    vi.mocked(db.query.lyrics.findFirst).mockResolvedValue({
      id: 1,
      songId: 10,
      generatorVersion: CURRENT_LYRICS_GENERATOR_VERSION
    } as any);

    const job = new LyricsJob(10, 'Test Song', eventBus);
    await job.execute();

    expect(getSongById).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('should fetch from filesystem .lrc file if present', async () => {
    vi.mocked(db.query.lyrics.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({
      id: 10,
      path: '/music/song.mp3',
      title: 'Test Song',
      duration: '180'
    } as any);

    vi.mocked(fs.readFile).mockResolvedValue('[00:05.00] Synced LRC line' as any);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        insert: vi.fn().mockReturnValue({ values: vi.fn() }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new LyricsJob(10, 'Test Song', eventBus);
    await job.execute();

    expect(db.transaction).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.LYRICS_CREATED, {
      songId: 10,
      provider: 'FILESYSTEM',
      isSynced: true
    });
  });

  it('should fetch from LRCLib if filesystem and embedded tags are absent', async () => {
    vi.mocked(db.query.lyrics.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({
      id: 10,
      path: '/music/song.mp3',
      title: 'Online Song',
      duration: '180',
      artists: [{ artist: { name: 'Online Artist' } }],
      albums: [{ album: { title: 'Online Album' } }]
    } as any);

    // Filesystem fails
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

    // Embedded tag empty
    const taglib = await import('node-taglib-sharp');
    vi.mocked(taglib.File.createFromPath).mockReturnValue({
      tag: { lyrics: '' },
      dispose: mockDispose
    } as any);

    // LRCLib returns synced lyrics
    vi.mocked(fetchLyricsFromLrclib).mockResolvedValue({
      lyrics: '[00:10.00] Online lyrics',
      lyricsType: 'SYNCED'
    } as any);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        insert: vi.fn().mockReturnValue({ values: vi.fn() }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new LyricsJob(10, 'Online Song', eventBus);
    await job.execute();

    expect(fetchLyricsFromLrclib).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.LYRICS_CREATED, {
      songId: 10,
      provider: 'LRCLIB',
      isSynced: true
    });
  });
});
