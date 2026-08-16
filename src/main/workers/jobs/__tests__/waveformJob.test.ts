import { EventEmitter } from 'events';
import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { GarbageCollectionJob } from '../garbageCollectionJob';
import { CURRENT_WAVEFORM_GENERATOR_VERSION, WaveformJob } from '../waveformJob';

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
    eventBus = new EventEmitter();
  });

  it('A-3: should write .tmp file, commit to DB, and publish to .bin', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);
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

    // Verify rename from .tmp to .bin
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

  it('A-3: GarbageCollectionJob should clean stale .tmp files and recover orphaned DB rows', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['stale.tmp', 'fresh.tmp', 'orphan.bin', 'valid.bin'] as any);

    const now = Date.now();
    vi.mocked(fs.stat).mockImplementation(async (filePath: any) => {
      if (String(filePath).includes('stale.tmp')) {
        return { mtimeMs: now - 120_000 } as any; // 2 minutes old -> STALE
      }
      if (String(filePath).includes('fresh.tmp')) {
        return { mtimeMs: now - 10_000 } as any; // 10 seconds old -> FRESH in-flight
      }
      if (String(filePath).includes('orphan.bin')) {
        return { mtimeMs: now - 120_000 } as any; // 2 minutes old -> ORPHAN
      }
      if (String(filePath).includes('valid.bin')) {
        return { mtimeMs: now - 10_000 } as any;
      }
      if (String(filePath).includes('missing_on_disk.bin')) {
        throw new Error('ENOENT'); // File missing on disk
      }
      return { mtimeMs: now } as any;
    });

    // DB has valid.bin and a row for missing_on_disk.bin
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([
        { id: 1, path: '/cache/waveforms/valid.bin' },
        { id: 2, path: '/cache/waveforms/missing_on_disk.bin' }
      ])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({
      where: deleteWhereMock
    } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    // Stale .tmp cleaned
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/stale\.tmp$/));
    // Fresh .tmp untouched
    expect(fs.unlink).not.toHaveBeenCalledWith(expect.stringMatching(/fresh\.tmp$/));
    // Orphan .bin cleaned
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringMatching(/orphan\.bin$/));

    // Crash recovery: DB row referencing missing file on disk is deleted
    expect(db.delete).toHaveBeenCalled();
  });
});
