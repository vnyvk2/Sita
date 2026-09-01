import { EventEmitter } from 'events';
import fs from 'fs/promises';

import { db } from '@main/db/db';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ASSET_EVENTS } from '../../libraryChoreography';
import { GarbageCollectionJob } from '../garbageCollectionJob';
import {
  CURRENT_WAVEFORM_GENERATOR_VERSION,
  WAVEFORM_RESOLUTION,
  WaveformJob
} from '../waveformJob';

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    unlink: vi.fn(),
    readdir: vi.fn(),
    link: vi.fn(),
    copyFile: vi.fn(),
    constants: {
      COPYFILE_EXCL: 1
    }
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

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    generateAsset: vi.fn()
  }
}));

vi.mock('@main/core/garbageCollector', () => ({
  collectGarbageArtworks: vi.fn().mockResolvedValue(0)
}));

describe('WaveformJob & Publication Protocol (Phase C4-B)', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);
    eventBus = new EventEmitter();
  });

  it('delegates waveform generation to mediaWorkerBridge, saves to DB, and emits event', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: 'C:/Cache/waveforms/123_v1.bin',
      metadata: {
        resolution: WAVEFORM_RESOLUTION,
        generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION
      }
    });

    const insertMock = vi.fn().mockReturnValue({ values: vi.fn() });
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({ insert: insertMock, update: vi.fn() } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    await job.execute();

    // Verify worker bridge invocation
    expect(mediaWorkerBridge.generateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'waveform',
        sourceFilePath: '/music/song.mp3',
        destinationPath: expect.stringMatching(/123_v1\.bin$/)
      })
    );

    // Verify DB commit
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // Verify post-commit event
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.WAVEFORM_CREATED, {
      songId: 123,
      path: expect.stringMatching(/123_v1\.bin$/)
    });
  });

  it('skips worker generation if waveform is already up to date in DB (Idempotency)', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue({
      id: 1,
      songId: 123,
      path: 'C:/Cache/waveforms/123_v1.bin',
      generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION
    } as any);

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.WAVEFORM_CREATED, {
      songId: 123,
      path: 'C:/Cache/waveforms/123_v1.bin'
    });
  });

  it('throws error when worker asset generation fails so scheduler can handle retries', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockRejectedValue(
      new Error('Worker process crashed')
    );

    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    await expect(job.execute()).rejects.toThrow('Worker process crashed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws error when generateAsset returns success: false without cancelled flag', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false
    });

    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    await expect(job.execute()).rejects.toThrow('Failed to generate waveform for song 123');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts cleanly before DB transaction if cancelled during worker generation', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    vi.mocked(mediaWorkerBridge.generateAsset).mockImplementation(async () => {
      job.state = 'cancelled';
      return {
        success: true,
        outputFilePath: 'C:/Cache/waveforms/123_v1.bin',
        metadata: {
          resolution: WAVEFORM_RESOLUTION,
          generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION
        }
      };
    });

    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts immediately without calling worker if cancelled before execution', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);
    job.cancel();

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts and suppresses DB persistence and events when cancel() is called mid-flight', async () => {
    vi.mocked(db.query.waveforms.findFirst).mockResolvedValue(null as any);
    const job = new WaveformJob(123, '/music/song.mp3', 'Test Song', eventBus);

    vi.mocked(mediaWorkerBridge.generateAsset).mockImplementation(async (opts) => {
      job.cancel();
      expect(opts.abortSignal?.aborted).toBe(true);
      return {
        success: false,
        cancelled: true
      };
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
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
      from: vi.fn().mockResolvedValue([{ id: 1, path: '/cache/waveforms/100_v1.bin' }])
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

    vi.mocked(fs.link).mockResolvedValue(undefined as any);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined as any);

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([{ id: 2, path: '/cache/waveforms/200_v1.bin' }])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    // Invariant: Stale file must be repaired atomically via link/copyFile
    expect(fs.link).toHaveBeenCalledWith(
      expect.stringMatching(/200_v1\.bin\.tmp$/),
      expect.stringMatching(/200_v1\.bin$/)
    );
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('A-3 REGRESSION Orphan Cleanup: Orphaned DB row without existing file or fresh temp file is cleaned up', async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as any); // no files in cache dir

    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT')); // .bin does not exist

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue([{ id: 300, path: '/cache/waveforms/300_v1.bin' }])
    } as any);

    const deleteWhereMock = vi.fn();
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhereMock } as any);

    const gcJob = new GarbageCollectionJob();
    await gcJob.execute();

    // Invariant: Missing file on disk causes orphaned DB row to be purged
    expect(db.delete).toHaveBeenCalled();
  });
});
