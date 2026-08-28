import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { processSongsWithWorkerPool } from '../../../../src/main/core/songWorkerPool';
import { tryToParseSong } from '../../../../src/main/parseSong/parseSong';
import { libraryScheduler } from '../../../../src/main/workers/jobScheduler';
import { ArtworkJob } from '../../../../src/main/workers/jobs/artworkJob';
import { mediaWorkerBridge } from '../../../../src/main/workers/process/MediaWorkerBridge';
import { ingestTrackDTO } from '../../../../src/main/parseSong/ingestTrackDTO';

vi.mock('../../../../src/main/parseSong/parseSong', () => ({
  tryToParseSong: vi.fn()
}));

vi.mock('../../../../src/main/parseSong/ingestTrackDTO', () => ({
  ingestTrackDTO: vi.fn()
}));

vi.mock('../../../../src/main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    isReady: vi.fn().mockReturnValue(false),
    getWorkerPid: vi.fn().mockReturnValue(1234),
    parseTrackBatchStream: vi.fn()
  }
}));

vi.mock('../../../../src/main/workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn(),
    on: vi.fn(),
    off: vi.fn()
  }
}));

vi.mock('../../../../src/main/main', () => ({
  sendMessageToRenderer: vi.fn(),
  dataUpdateEvent: vi.fn()
}));

vi.mock('../../../../src/main/db/db', () => ({
  db: {
    transaction: vi.fn(async (cb: (trx: any) => Promise<any>) => cb({}))
  }
}));

vi.mock('../../../../src/main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({ payloads: [] })
}));

describe('songWorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse songs with bounded concurrency and queue artwork jobs', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    (tryToParseSong as Mock).mockResolvedValueOnce({
      songData: { id: 1, title: 'Song 1' },
      newAlbum: { id: 1, title: 'Album 1' }
    }).mockResolvedValueOnce({
      songData: { id: 2, title: 'Song 2' },
      relevantAlbum: { id: 2, title: 'Album 2' }
    });

    const updateProgress = vi.fn();

    await processSongsWithWorkerPool(songs, undefined, updateProgress, 2);

    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/1.mp3', undefined, false, false);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/2.mp3', undefined, false, false);

    expect(updateProgress).toHaveBeenCalledTimes(2);

    const artworkJobs = vi.mocked(libraryScheduler.enqueue).mock.calls
      .map(([job]) => job)
      .filter((job) => job instanceof ArtworkJob);
    expect(artworkJobs).toHaveLength(2);
    // ArtworkJob arguments: albumId, path, title, scheduler
    expect(libraryScheduler.enqueue).toHaveBeenNthCalledWith(1, expect.any(ArtworkJob));
  });

  it('should deduplicate album artwork jobs', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    // Both songs belong to the same album
    (tryToParseSong as Mock).mockResolvedValue({
      songData: { id: 1, title: 'Song 1' },
      relevantAlbum: { id: 1, title: 'Same Album' }
    });

    await processSongsWithWorkerPool(songs, undefined, undefined, 2);

    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    // Should only enqueue one artwork job for album ID 1
    const artworkJobs = vi.mocked(libraryScheduler.enqueue).mock.calls
      .map(([job]) => job)
      .filter((job) => job instanceof ArtworkJob);
    expect(artworkJobs).toHaveLength(1);
  });

  it('should abort cleanly when abortSignal is aborted', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' },
      { songPath: '/test/3.mp3' }
    ];

    const controller = new AbortController();
    
    // Abort during the first parse
    (tryToParseSong as Mock).mockImplementation(async (path) => {
      if (path === '/test/1.mp3') {
        controller.abort();
      }
      return { relevantAlbum: { id: 1, title: 'Album 1' } };
    });

    // We pass maxConcurrency = 1 to ensure it processes sequentially and stops early
    await processSongsWithWorkerPool(songs, controller.signal, undefined, 1);

    // Should only parse the first song, and stop.
    expect(tryToParseSong).toHaveBeenCalledTimes(1);
    expect(libraryScheduler.enqueue).toHaveBeenCalledTimes(0);
  });

  it('should fallback to local parsing for ONLY remaining uncommitted songs when worker fails mid-stream', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' },
      { songPath: '/test/3.mp3' },
      { songPath: '/test/4.mp3' }
    ];

    vi.mocked(mediaWorkerBridge.isReady).mockReturnValue(true);
    vi.mocked(mediaWorkerBridge.parseTrackBatchStream).mockImplementation(async (_tracks, options) => {
      // Emit batch 1 with 2 tracks successfully
      await options.onBatch({
        batchId: 0,
        isLastBatch: false,
        tracks: [
          { songPath: '/test/1.mp3', duration: 100 } as any,
          { songPath: '/test/2.mp3', duration: 200 } as any
        ],
        errors: [],
        cancelled: false
      });

      // Crash / fail before batch 2
      throw new Error('Worker crashed mid-stream');
    });

    vi.mocked(ingestTrackDTO).mockResolvedValue({
      songData: { id: 1, title: 'Song 1' } as any,
      newAlbum: { id: 10, title: 'Album 1' } as any,
      relevantAlbum: undefined,
      newArtists: [],
      newGenres: []
    });

    (tryToParseSong as Mock).mockResolvedValue({
      songData: { id: 3, title: 'Song 3' },
      relevantAlbum: { id: 10, title: 'Album 1' }
    });

    const progressCalls: Array<{ current: number; total: number }> = [];
    const updateProgress = (current: number, total: number) => {
      progressCalls.push({ current, total });
    };

    const result = await processSongsWithWorkerPool(songs, undefined, updateProgress, 1);

    // Batch 1 (songs 1 and 2) was committed via worker -> ingestTrackDTO called twice
    expect(ingestTrackDTO).toHaveBeenCalledTimes(2);

    // Fallback should ONLY parse the remaining 2 uncommitted songs (songs 3 and 4)
    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/3.mp3', undefined, false, false);
    expect(tryToParseSong).toHaveBeenCalledWith('/test/4.mp3', undefined, false, false);
    expect(tryToParseSong).not.toHaveBeenCalledWith('/test/1.mp3', expect.anything(), expect.anything(), expect.anything());
    expect(tryToParseSong).not.toHaveBeenCalledWith('/test/2.mp3', expect.anything(), expect.anything(), expect.anything());

    // Total success count = 2 from worker + 2 from local fallback = 4
    expect(result.successCount).toBe(4);

    // Progress updates should be monotonic and reach 4/4
    expect(progressCalls).toEqual([
      { current: 2, total: 4 }, // Worker batch 1 completed
      { current: 3, total: 4 }, // Local fallback song 3
      { current: 4, total: 4 }  // Local fallback song 4
    ]);
  });

  it('should parse all songs locally if worker fails before batch 1 commits', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    vi.mocked(mediaWorkerBridge.isReady).mockReturnValue(true);
    vi.mocked(mediaWorkerBridge.parseTrackBatchStream).mockRejectedValue(
      new Error('Worker failed to initialize streaming')
    );

    (tryToParseSong as Mock).mockResolvedValue({
      songData: { id: 1, title: 'Song 1' },
      relevantAlbum: { id: 10, title: 'Album 1' }
    });

    const progressCalls: Array<{ current: number; total: number }> = [];
    const updateProgress = (current: number, total: number) => {
      progressCalls.push({ current, total });
    };

    const result = await processSongsWithWorkerPool(songs, undefined, updateProgress, 1);

    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    expect(result.successCount).toBe(2);
    expect(progressCalls).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 }
    ]);
  });

  it('isolates staged transaction state and emits zero ghost jobs or duplicate fallback counts on db.transaction rollback', async () => {
    const songs = [
      { songPath: '/test/1.mp3' },
      { songPath: '/test/2.mp3' }
    ];

    vi.mocked(mediaWorkerBridge.isReady).mockReturnValue(true);
    vi.mocked(mediaWorkerBridge.parseTrackBatchStream).mockImplementation(async (_songs, options: any) => {
      // Worker delivers 1 batch with 2 tracks
      await options.onBatch({
        batchId: 'batch-1',
        tracks: [
          { songPath: '/test/1.mp3', title: 'Song 1', duration: 180 } as any,
          { songPath: '/test/2.mp3', title: 'Song 2', duration: 200 } as any
        ],
        errors: [],
        isLastBatch: true,
        durablyCommittedCount: 0
      });
      return { totalTracks: 2, totalBatches: 1, failedTracks: [], cancelled: false };
    });

    // Mock ingestTrackDTO to succeed on track 1
    vi.mocked(ingestTrackDTO).mockResolvedValue({
      songData: { id: 101, title: 'Song 1' } as any,
      relevantAlbum: { id: 50, title: 'Album 1' } as any,
      newArtists: [],
      newGenres: []
    });

    // Mock db.transaction to fail and rollback
    const { db } = await import('../../../../src/main/db/db');
    vi.mocked(db.transaction).mockRejectedValueOnce(new Error('Postgres transaction rollback error'));

    // When fallback runs locally, tryToParseSong succeeds for both songs
    (tryToParseSong as Mock).mockResolvedValue({
      songData: { id: 201, title: 'Local Song' },
      relevantAlbum: { id: 50, title: 'Album 1' }
    });

    const result = await processSongsWithWorkerPool(songs, undefined, undefined, 2);

    // 1. Fallback processed both songs locally because durablyCommittedSongCount remained 0
    expect(tryToParseSong).toHaveBeenCalledTimes(2);
    // 2. Success count is exact (2), not double-counted (not 1 from aborted tx + 2 from fallback = 3)
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);

    // 3. Verify zero ghost jobs leaked from the aborted transaction (song ID 101 was never enqueued)
    const enqueuedCalls = vi.mocked(libraryScheduler.enqueue).mock.calls;
    const enqueuedJobIds = enqueuedCalls
      .map((call) => (call[0] as any).songId ?? (call[0] as any).id)
      .filter(Boolean);
    expect(enqueuedJobIds).not.toContain(101);
  });
});
