import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { GarbageCollectionJob } from '../garbageCollectionJob';
import { WaveformJob } from '../waveformJob';

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn()
  }
}));

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      waveforms: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn(),
    select: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('@main/core/garbageCollector', () => ({
  collectGarbageArtworks: vi.fn().mockResolvedValue(0)
}));

describe('WaveformJob & Publication Protocol', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);
    eventBus = new EventEmitter();
  });

  it('A-3: should write .tmp file, commit to DB, and atomically publish directly to .bin (no prior unlink)', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.rename).mockResolvedValue(undefined as any);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      // Invariant: .tmp file must be written before DB transaction
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.bin\.tmp$/),
        expect.any(Buffer)
      );
      return callback({
        insert: vi.fn().mockReturnValue({ values: vi.fn() }),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    await job.execute();

    // Verify atomic rename directly from .tmp to .bin (NO prior unlink of destination)
    expect(fs.unlink).not.toHaveBeenCalledWith(expect.stringMatching(/123_v1\.bin$/));
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringMatching(/123_v1\.bin\.tmp$/),
      expect.stringMatching(/123_v1\.bin$/)
    );

    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.WAVEFORM_CREATED, {
      songId: 123,
      path: expect.stringMatching(/123_v1\.bin$/)
    });
  });

  it('A-3: should clean up temp file and abort if cancelled before DB transaction', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);

    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);
    
    // Simulate cancellation arriving during peak generation / write
    vi.mocked(fs.writeFile).mockImplementation(async () => {
      job.state = 'cancelled';
    });

    await job.execute();

    expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/123_v1\.bin\.tmp$/));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('A-3 REGRESSION Race A: In-flight GC must NOT delete DB row while temp file is fresh (<60s)', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['100_v1.bin.tmp'] as any);

    const now = Date.now();
    vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('100_v1.bin')) {
        throw new Error('ENOENT'); // final .bin not yet published
      }
      if (String(filePath).endsWith('100_v1.bin.tmp')) {
        return { mtimeMs: now - 5_000 } as any; // 5 seconds old -> in-flight
      }
      return { mtimeMs: now } as any;
    });

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 1, path: '/cache/waveforms/100_v1.bin' }
      ])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    // Invariant: DB row MUST NOT be deleted during in-flight publication window
    expect(db.delete).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalledWith(expect.stringMatching(/100_v1\.bin\.tmp$/));
  });

  it('A-3 REGRESSION Crash Recovery: Stale temp file (>60s) with valid DB row must be self-healed and promoted', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['200_v1.bin.tmp'] as any);

    const now = Date.now();
    vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('200_v1.bin')) {
        throw new Error('ENOENT'); // crashed before rename
      }
      if (String(filePath).endsWith('200_v1.bin.tmp')) {
        return { mtimeMs: now - 120_000 } as any; // 2 minutes old -> crashed abandoned write
      }
      return { mtimeMs: now } as any;
    });

    vi.mocked(fs.rename).mockResolvedValue(undefined as any);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 2, path: '/cache/waveforms/200_v1.bin' }
      ])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    // Self-healing: promote matching .tmp to .bin
    expect(fs.rename).toHaveBeenCalledWith(
      '/cache/waveforms/200_v1.bin.tmp',
      '/cache/waveforms/200_v1.bin'
    );
    // DB row is preserved
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('A-3: Orphaned DB row with neither .bin nor .tmp must be deleted by GC', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    vi.mocked(fs.stat).mockImplementation(async () => {
      throw new Error('ENOENT'); // neither .bin nor .tmp exists
    });

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 999, path: '/cache/waveforms/nonexistent.bin' }
      ])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    expect(db.delete).toHaveBeenCalled();
  });
});
