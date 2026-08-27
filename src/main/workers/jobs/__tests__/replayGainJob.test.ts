import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@main/db/db';
import { getSongById } from '@main/db/queries/songs';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION, ReplayGainJob } from '../replayGainJob';

vi.mock('@main/db/queries/songs', () => ({
  getSongById: vi.fn()
}));

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      replayGain: {
        findFirst: vi.fn()
      }
    },
    transaction: vi.fn()
  }
}));

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    generateAsset: vi.fn()
  }
}));

describe('ReplayGainJob (Phase C4-C)', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('handles missing song gracefully without throwing', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue(null as any);

    const job = new ReplayGainJob(999, 'Nonexistent Song', eventBus);
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('skips processing if ReplayGain is already up to date in DB (Idempotency)', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue({
      id: 1,
      songId: 10,
      trackGain: -7.5,
      trackPeak: 0.95,
      generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
    } as any);

    const job = new ReplayGainJob(10, 'Test Song', eventBus);
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('delegates loudness analysis to mediaWorkerBridge, inserts new DB row, and emits event', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: '',
      metadata: {
        trackGain: -8.2,
        trackPeak: 0.98,
        albumGain: -8.2,
        albumPeak: 0.98,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      }
    });

    const insertValuesMock = vi.fn();
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        insert: vi.fn().mockReturnValue({ values: insertValuesMock })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ReplayGainJob(10, 'Test Song', eventBus);
    await job.execute();

    // Verify worker bridge delegation
    expect(mediaWorkerBridge.generateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'replaygain',
        sourceFilePath: 'C:/Music/song.mp3'
      })
    );

    // Verify DB insert
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        songId: 10,
        trackGain: -8.2,
        trackPeak: 0.98,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      })
    );

    // Verify post-commit event
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.REPLAYGAIN_CREATED, {
      songId: 10,
      trackGain: -8.2,
      trackPeak: 0.98
    });
  });

  it('updates existing outdated ReplayGain record in DB', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue({
      id: 1,
      songId: 10,
      trackGain: -5.0,
      trackPeak: 0.8,
      generatorVersion: 0 // outdated version
    } as any);

    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: '',
      metadata: {
        trackGain: -8.2,
        trackPeak: 0.98,
        albumGain: -8.2,
        albumPeak: 0.98,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      }
    });

    const setMock = vi.fn().mockReturnValue({ where: vi.fn() });
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        update: vi.fn().mockReturnValue({ set: setMock })
      } as any);
    });

    const job = new ReplayGainJob(10, 'Test Song', eventBus);
    await job.execute();

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackGain: -8.2,
        trackPeak: 0.98,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      })
    );
  });

  it('throws error when worker asset generation fails so scheduler can handle retries', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false,
      error: 'Worker process crashed'
    });

    const job = new ReplayGainJob(10, 'Test Song', eventBus);

    await expect(job.execute()).rejects.toThrow('Worker process crashed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts cleanly before DB transaction if cancelled during worker generation', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);

    const job = new ReplayGainJob(10, 'Test Song', eventBus);

    vi.mocked(mediaWorkerBridge.generateAsset).mockImplementation(async () => {
      job.state = 'cancelled';
      return {
        success: true,
        outputFilePath: '',
        metadata: {
          trackGain: -8.2,
          trackPeak: 0.98,
          albumGain: -8.2,
          albumPeak: 0.98,
          generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
        }
      };
    });

    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
  });
});
