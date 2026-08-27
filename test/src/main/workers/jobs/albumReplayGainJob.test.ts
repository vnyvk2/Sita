import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@main/db/db';
import { ASSET_EVENTS } from '@main/workers/libraryChoreography';
import { AlbumReplayGainJob } from '@main/workers/jobs/albumReplayGainJob';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION } from '@main/workers/jobs/replayGainJob';

vi.mock('fs/promises');

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      albumsSongs: {
        findMany: vi.fn()
      },
      replayGain: {
        findMany: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

describe('Gate D3: AlbumReplayGainJob (Multi-Track Aggregation, Stale Guard, Idempotency)', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('skips gracefully when album has no songs', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([]);

    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    expect(db.query.replayGain.findMany).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('defers aggregation when album is incomplete (not all tracks have track ReplayGain)', async () => {
    // 3 songs in album
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 },
      { albumId: 1, songId: 103 }
    ] as any);

    // Only 2 songs have replay_gain records
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      { songId: 101, trackGain: -5.0, trackPeak: 0.9, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: new Date() },
      { songId: 102, trackGain: -6.0, trackPeak: 0.8, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: new Date() }
    ] as any);

    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    // Must NOT proceed to reading block caches or writing to DB
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('skips processing if album is already fully up to date (Constraint #7)', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    // Both tracks have matching albumGain (-7.2) and albumPeak (0.95)
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      { songId: 101, trackGain: -6.0, trackPeak: 0.8, albumGain: -7.2, albumPeak: 0.95, generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION, updatedAt: new Date() },
      { songId: 102, trackGain: -8.0, trackPeak: 0.95, albumGain: -7.2, albumPeak: 0.95, generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION, updatedAt: new Date() }
    ] as any);

    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    expect(fs.readFile).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aggregates Float64 block caches, updates DB atomically, and emits event (Constraints #1, #3, #4, #5)', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    const time101 = new Date('2026-08-27T10:00:00Z');
    const time102 = new Date('2026-08-27T10:00:00Z');

    const rgRows = [
      { songId: 101, trackGain: -5.0, trackPeak: 0.8, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: time101 },
      { songId: 102, trackGain: -7.0, trackPeak: 0.95, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: time102 }
    ];
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue(rgRows as any);

    // Mock Float64Array block caches on disk (10 blocks each at ~ -14.0 LUFS)
    const blocks101 = new Float64Array(10).fill(0.04);
    const blocks102 = new Float64Array(10).fill(0.05);

    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).includes('101_v1.bin')) {
        return Buffer.from(blocks101.buffer);
      }
      if (String(filePath).includes('102_v1.bin')) {
        return Buffer.from(blocks102.buffer);
      }
      throw new Error('ENOENT');
    });

    const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn() });
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        query: {
          replayGain: {
            findMany: vi.fn().mockResolvedValue(rgRows) // Unchanged current rows
          }
        },
        update: vi.fn().mockReturnValue({ set: updateSetMock })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    // Verify DB update called with albumGain and albumPeak
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        albumGain: expect.any(Number),
        albumPeak: 0.95, // max(0.8, 0.95)
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      })
    );

    // Verify post-commit event emission
    expect(emitSpy).toHaveBeenCalledWith(
      ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED,
      expect.objectContaining({
        albumId: 1,
        albumPeak: 0.95,
        songCount: 2
      })
    );
  });

  it('detects stale aggregation and aborts commit if a song was updated during calculation (Constraint #6)', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    const initialTime = new Date('2026-08-27T10:00:00Z');
    const rgRows = [
      { songId: 101, trackGain: -5.0, trackPeak: 0.8, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: initialTime },
      { songId: 102, trackGain: -7.0, trackPeak: 0.95, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: initialTime }
    ];
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue(rgRows as any);

    const blocks = new Float64Array(10).fill(0.04);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(blocks.buffer));

    const updateSetMock = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      // Return a MODIFIED row during transaction (simulating concurrent track re-analysis)
      const modifiedTime = new Date('2026-08-27T10:05:00Z');
      const concurrentRows = [
        { songId: 101, trackGain: -5.0, trackPeak: 0.8, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: initialTime },
        { songId: 102, trackGain: -9.0, trackPeak: 0.99, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: modifiedTime }
      ];

      return callback({
        query: {
          replayGain: {
            findMany: vi.fn().mockResolvedValue(concurrentRows)
          }
        },
        update: vi.fn().mockReturnValue({ set: updateSetMock })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    // Verify commit was aborted due to stale detection
    expect(updateSetMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED, expect.anything());
  });

  it('defers aggregation gracefully when a block cache file is missing on disk', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 }
    ] as any);

    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      { songId: 101, trackGain: -5.0, trackPeak: 0.8, albumGain: null, albumPeak: null, generatorVersion: 1, updatedAt: new Date() }
    ] as any);

    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: file not found'));

    const job = new AlbumReplayGainJob(1, eventBus);
    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
  });
});
