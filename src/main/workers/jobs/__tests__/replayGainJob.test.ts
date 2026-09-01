import { EventEmitter } from 'events';

import { db } from '@main/db/db';
import { getSongById } from '@main/db/queries/songs';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      },
      albumsSongs: {
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
        albumGain: null,
        albumPeak: null,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      })
    );
  });

  it('invalidates existing albumGain and albumPeak to null on track re-analysis to force album recomputation', async () => {
    // Existing record with previously computed album metrics
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue({
      id: 5,
      songId: 20,
      trackGain: -6.0,
      trackPeak: 0.8,
      albumGain: -7.5,
      albumPeak: 0.95,
      generatorVersion: 0 // forces re-analysis
    } as any);

    vi.mocked(db.query.albumsSongs.findFirst).mockResolvedValue({
      albumId: 42,
      songId: 20
    } as any);

    vi.mocked(getSongById).mockResolvedValue({
      id: 20,
      path: 'C:/Music/track_reanalyzed.wav'
    } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: 'C:/loudness_blocks/20_v1.bin',
      metadata: {
        trackGain: -9.1,
        trackPeak: 0.99,
        generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
      }
    });

    const setMock = vi.fn().mockReturnValue({ where: vi.fn() });
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      return callback({
        update: vi.fn().mockReturnValue({ set: setMock })
      } as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ReplayGainJob(20, 'Track 20', eventBus);
    await job.execute();

    // Invariant: albumGain and albumPeak MUST be reset to null
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trackGain: -9.1,
        trackPeak: 0.99,
        albumGain: null,
        albumPeak: null
      })
    );

    // Event must carry albumId so choreography can re-trigger AlbumReplayGainJob
    expect(emitSpy).toHaveBeenCalledWith(
      ASSET_EVENTS.REPLAYGAIN_CREATED,
      expect.objectContaining({
        songId: 20,
        albumId: 42,
        trackGain: -9.1,
        trackPeak: 0.99
      })
    );
  });

  it('throws error when worker asset generation fails so scheduler can handle retries', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockRejectedValue(
      new Error('Worker process crashed')
    );

    const job = new ReplayGainJob(10, 'Test Song', eventBus);

    await expect(job.execute()).rejects.toThrow('Worker process crashed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws error when generateAsset returns success: false without cancelled flag', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false
    });

    const job = new ReplayGainJob(10, 'Test Song', eventBus);

    await expect(job.execute()).rejects.toThrow('Failed to analyze loudness for song 10');
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

  it('aborts immediately without calling worker if cancelled before execution', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);

    const job = new ReplayGainJob(10, 'Test Song', eventBus);
    job.cancel();

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts and suppresses DB persistence and events when cancel() is called mid-flight', async () => {
    vi.mocked(db.query.replayGain.findFirst).mockResolvedValue(null as any);
    vi.mocked(getSongById).mockResolvedValue({ id: 10, path: 'C:/Music/song.mp3' } as any);

    const job = new ReplayGainJob(10, 'Test Song', eventBus);

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
});
