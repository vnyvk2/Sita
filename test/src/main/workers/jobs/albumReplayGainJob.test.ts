import fs from 'fs/promises';

import { db } from '@main/db/db';
import { AlbumReplayGainJob } from '@main/workers/jobs/albumReplayGainJob';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION } from '@main/workers/jobs/replayGainJob';
import { JobScheduler } from '@main/workers/jobScheduler';
import { ASSET_EVENTS } from '@main/workers/libraryChoreography';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('Gate D3: AlbumReplayGainJob (Multi-Track Aggregation, Atomic Concurrency, Invariants)', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new JobScheduler();
  });

  it('skips gracefully when album has no songs', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([]);

    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(db.query.replayGain.findMany).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('defers aggregation when album is incomplete (not all tracks have track ReplayGain) and schedules re-enqueue', async () => {
    // 3 songs in album
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 },
      { albumId: 1, songId: 103 }
    ] as any);

    // Only 2 songs have replay_gain records
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.9,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date()
      },
      {
        songId: 102,
        trackGain: -6.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date()
      }
    ] as any);

    const deferSpy = vi.spyOn(scheduler, 'scheduleDeferred');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    // Must NOT proceed to reading block caches or writing to DB
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();

    // Must use scheduler's explicit deferred enqueue mechanism (NOT fake domain event)
    expect(deferSpy).toHaveBeenCalledOnce();
    expect(deferSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'album_replaygain',
        albumId: 1
      }),
      5000
    );
  });

  it('skips processing if album is already fully up to date (Constraint #7)', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    // Both tracks have matching albumGain (-7.2) and albumPeak (0.95)
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -6.0,
        trackPeak: 0.8,
        albumGain: -7.2,
        albumPeak: 0.95,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
        updatedAt: new Date()
      },
      {
        songId: 102,
        trackGain: -8.0,
        trackPeak: 0.95,
        albumGain: -7.2,
        albumPeak: 0.95,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
        updatedAt: new Date()
      }
    ] as any);

    const job = new AlbumReplayGainJob(1, scheduler);
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
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: time101
      },
      {
        songId: 102,
        trackGain: -7.0,
        trackPeak: 0.95,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: time102
      }
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

    const returningMock = vi.fn().mockResolvedValue([{ id: 1 }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const updateSetMock = vi.fn().mockReturnValue({ where: whereMock });

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

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
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

  it('detects missing rows during transaction validation and aborts commit', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    const initialTime = new Date('2026-08-27T10:00:00Z');
    const rgRows = [
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      },
      {
        songId: 102,
        trackGain: -7.0,
        trackPeak: 0.95,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      }
    ];
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue(rgRows as any);

    const blocks = new Float64Array(10).fill(0.04);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(blocks.buffer));

    const updateSetMock = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      // Row 102 disappeared during aggregation!
      const currentRows = [
        {
          songId: 101,
          trackGain: -5.0,
          trackPeak: 0.8,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: initialTime
        }
      ];

      return callback({
        query: {
          replayGain: {
            findMany: vi.fn().mockResolvedValue(currentRows)
          }
        },
        update: vi.fn().mockReturnValue({ set: updateSetMock })
      } as any);
    });

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(updateSetMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(
      ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED,
      expect.anything()
    );
  });

  it('detects stale aggregation and aborts commit if a song was updated before transaction validation', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    const initialTime = new Date('2026-08-27T10:00:00Z');
    const rgRows = [
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      },
      {
        songId: 102,
        trackGain: -7.0,
        trackPeak: 0.95,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      }
    ];
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue(rgRows as any);

    const blocks = new Float64Array(10).fill(0.04);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(blocks.buffer));

    const updateSetMock = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      // Return a MODIFIED row during transaction (simulating concurrent track re-analysis)
      const modifiedTime = new Date('2026-08-27T10:05:00Z');
      const concurrentRows = [
        {
          songId: 101,
          trackGain: -5.0,
          trackPeak: 0.8,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: initialTime
        },
        {
          songId: 102,
          trackGain: -9.0,
          trackPeak: 0.99,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: modifiedTime
        }
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

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    // Verify commit was aborted due to stale detection
    expect(updateSetMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalledWith(
      ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED,
      expect.anything()
    );
  });

  it('aborts commit when a race occurs after validation but before atomic update (True Optimistic Concurrency)', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    const initialTime = new Date('2026-08-27T10:00:00Z');
    const rgRows = [
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      },
      {
        songId: 102,
        trackGain: -7.0,
        trackPeak: 0.95,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: initialTime
      }
    ];
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue(rgRows as any);

    const blocks = new Float64Array(10).fill(0.04);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(blocks.buffer));

    // Simulate: validation passed, but during update for song 102, the WHERE condition
    // (updatedAt = initialTime) failed because another transaction sneaked in, returning []
    let callCount = 0;
    const returningMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return [{ id: 1 }]; // Song 101 updated
      return []; // Song 102 failed optimistic WHERE check!
    });
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const updateSetMock = vi.fn().mockReturnValue({ where: whereMock });

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        query: {
          replayGain: {
            findMany: vi.fn().mockResolvedValue(rgRows) // Validation initially sees matching rows
          }
        },
        update: vi.fn().mockReturnValue({ set: updateSetMock })
      } as any);
    });

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);

    // Optimistic concurrency conflict now throws (propagates to JobScheduler for retry)
    await expect(job.execute()).rejects.toThrow('Optimistic concurrency conflict on song 102');

    // Verify event was NOT emitted because the error was thrown before emission
    expect(emitSpy).not.toHaveBeenCalledWith(
      ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED,
      expect.anything()
    );
  });

  it('safely rejects corrupt, truncated, or misaligned block caches (0, 7, 15 bytes) without throwing', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 }
    ] as any);

    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date()
      }
    ] as any);

    // Test 1: 0 bytes (empty file)
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(0));
    const job1 = new AlbumReplayGainJob(1, scheduler);
    await job1.execute();
    expect(db.transaction).not.toHaveBeenCalled();

    // Test 2: 7 bytes (truncated float)
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(7));
    const job2 = new AlbumReplayGainJob(1, scheduler);
    await job2.execute();
    expect(db.transaction).not.toHaveBeenCalled();

    // Test 3: 15 bytes (misaligned: not divisible by 8)
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.alloc(15));
    const job3 = new AlbumReplayGainJob(1, scheduler);
    await job3.execute();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('defers aggregation gracefully when a block cache file is missing on disk', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 }
    ] as any);

    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date()
      }
    ] as any);

    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: file not found'));

    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts immediately without querying DB if cancelled before execution', async () => {
    const job = new AlbumReplayGainJob(1, scheduler);
    job.cancel();

    expect(job.isCancelled()).toBe(true);
    const emitSpy = vi.spyOn(scheduler, 'emit');
    await job.execute();

    expect(db.query.albumsSongs.findMany).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts mid-flight and prevents DB transaction commit when cancel() is called', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockImplementation(async () => {
      job.cancel();
      return [{ albumId: 1, songId: 101 }] as any;
    });

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(job.isCancelled()).toBe(true);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts after track replayGain rows query if cancelled mid-flight', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 }
    ] as any);

    vi.mocked(db.query.replayGain.findMany).mockImplementation(async () => {
      job.cancel();
      return [
        {
          songId: 101,
          trackGain: -5.0,
          trackPeak: 0.8,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: new Date()
        }
      ] as any;
    });

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(job.isCancelled()).toBe(true);
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts inside transaction if cancelled before transaction commit', async () => {
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 }
    ] as any);

    const now = new Date();
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: now
      }
    ] as any);

    const blocks = new Float64Array(10).fill(0.04);
    vi.mocked(fs.readFile).mockResolvedValue(Buffer.from(blocks.buffer));

    const updateMock = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      job.cancel(); // cancel right as transaction callback is entered
      return callback({
        query: {
          replayGain: {
            findMany: vi.fn()
          }
        },
        update: updateMock
      } as any);
    });

    const emitSpy = vi.spyOn(scheduler, 'emit');
    const job = new AlbumReplayGainJob(1, scheduler);
    await job.execute();

    expect(job.isCancelled()).toBe(true);
    expect(updateMock).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
