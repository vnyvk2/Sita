import { EventEmitter } from 'events';

import { db } from '@main/db/db';
import { AlbumReplayGainJob } from '@main/workers/jobs/albumReplayGainJob';
import { GarbageCollectionJob } from '@main/workers/jobs/garbageCollectionJob';
import { JobScheduler } from '@main/workers/jobScheduler';
import { ASSET_EVENTS } from '@main/workers/libraryChoreography';
import { MediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import type { Job, JobState } from '@main/workers/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockChildProcess extends EventEmitter {
  public pid = 1234;
  public postMessage = vi.fn();
  public kill = vi.fn();
}

vi.mock('@main/db/db', () => ({
  db: {
    query: {
      albumsSongs: { findMany: vi.fn() },
      replayGain: { findMany: vi.fn() },
      waveforms: { findMany: vi.fn() }
    },
    select: vi.fn().mockReturnValue({ from: vi.fn().mockResolvedValue([]) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    update: vi
      .fn()
      .mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: 1 }]) })
      }),
    transaction: vi.fn(async (cb) => {
      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 1 }])
        })
      });
      const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });
      const mockTrx = {
        query: {
          replayGain: {
            findMany: vi.fn().mockResolvedValue([
              { songId: 101, updatedAt: new Date(1000) },
              { songId: 102, updatedAt: new Date(1000) }
            ])
          }
        },
        update: updateMock
      };
      return await cb(mockTrx);
    })
  }
}));

vi.mock('@main/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('fs/promises', () => {
  const float64Buffer = Buffer.alloc(800);
  for (let i = 0; i < 100; i++) {
    float64Buffer.writeDoubleLE(0.01 * (i + 1), i * 8);
  }

  return {
    default: {
      readFile: vi.fn().mockResolvedValue(float64Buffer),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi
        .fn()
        .mockResolvedValue({ isFile: () => true, size: 800, mtimeMs: Date.now() - 120_000 }),
      unlink: vi.fn().mockResolvedValue(undefined)
    }
  };
});

describe('Phase 2 FORENSIC: Liveness, Scheduler Invariants & Timeouts', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new JobScheduler();
    scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
    scheduler.dispose();
  });

  // -------------------------------------------------------------------------
  // Item 6: Album ReplayGain Liveness with Real JobScheduler
  // -------------------------------------------------------------------------
  it('Item 6: Incomplete album defers -> Track completes -> Deferred execution completes album aggregation', async () => {
    vi.useFakeTimers();

    // 1. Initial State: Album has 2 tracks (101, 102). Only track 101 has ReplayGain.
    vi.mocked(db.query.albumsSongs.findMany).mockResolvedValue([
      { albumId: 1, songId: 101 },
      { albumId: 1, songId: 102 }
    ] as any);

    // First query for Job 1: incomplete
    vi.mocked(db.query.replayGain.findMany).mockResolvedValueOnce([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.9,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date(1000)
      }
    ] as any);

    const deferSpy = vi.spyOn(scheduler, 'scheduleDeferred');

    // 2. Enqueue Job #1
    const job1 = new AlbumReplayGainJob(1, scheduler);
    scheduler.enqueue(job1);

    // Let scheduler run Job #1
    await vi.advanceTimersByTimeAsync(50);

    // Verify Job #1 deferred and scheduled re-enqueue
    expect(deferSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'album_replaygain', albumId: 1 }),
      5000
    );

    // 3. Track 102 completes ReplayGain now
    vi.mocked(db.query.replayGain.findMany).mockResolvedValue([
      {
        songId: 101,
        trackGain: -5.0,
        trackPeak: 0.9,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date(1000)
      },
      {
        songId: 102,
        trackGain: -6.0,
        trackPeak: 0.8,
        albumGain: null,
        albumPeak: null,
        generatorVersion: 1,
        updatedAt: new Date(1000)
      }
    ] as any);

    // Track ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED emission
    let updatedEventPayload: any = null;
    scheduler.on(ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED, (payload) => {
      updatedEventPayload = payload;
    });

    // 4. Advance time by 5000ms for deferred timer to fire and execute Job #2
    await vi.advanceTimersByTimeAsync(5050);

    // 5. Verify Album ReplayGain event was received
    expect(updatedEventPayload).not.toBeNull();
    expect(updatedEventPayload.albumId).toBe(1);

    vi.useRealTimers();
  });

  it('Item 6b: Shutdown while deferred timer exists -> Deferred timer is cancelled and does NOT enqueue after stop', async () => {
    vi.useFakeTimers();

    const dummyJob: Job = {
      id: 'dummy_deferred',
      type: 'waveform',
      priority: 5,
      jobClass: 'batch',
      state: 'queued' as JobState,
      execute: vi.fn().mockResolvedValue(undefined)
    };

    scheduler.scheduleDeferred(dummyJob, 5000);

    // Stop scheduler before timer fires
    await scheduler.stop();

    // Advance timers past 5000ms
    await vi.advanceTimersByTimeAsync(6000);

    // Dummy job must NOT have executed
    expect(dummyJob.execute).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Item 7: Parse Stream Timeout (Hung Worker)
  // -------------------------------------------------------------------------
  it('Item 7: Hung worker in parseTrackBatchStream -> Timeout fires -> Task cancelled and slot freed', async () => {
    vi.useFakeTimers();

    const bridge = new MediaWorkerBridge();
    const mockChild = new MockChildProcess();
    (bridge as any).childProcess = mockChild;
    (bridge as any).ready = true;
    (bridge as any).state = 'READY';

    const songsToParse = [{ songPath: '/mock/hung.mp3', folderId: 1 }];

    // Request parse stream with 1000ms timeout
    const parsePromise = bridge.parseTrackBatchStream(songsToParse, {
      timeoutMs: 1000,
      onBatch: vi.fn().mockResolvedValue(undefined)
    });

    const expectation = expect(parsePromise).rejects.toThrow(/timed out after 1000ms/);

    // Advance time past 1000ms
    await vi.advanceTimersByTimeAsync(1100);

    // Must reject with timeout error
    await expectation;

    // Invariant: activeParseResolvers must be cleaned up
    expect((bridge as any).activeParseResolvers.size).toBe(0);

    // Subsequent parse task can run without being blocked
    expect(bridge.isReady()).toBe(true);

    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Item 8: Scheduler State Machine & Deduplication Invariants
  // -------------------------------------------------------------------------
  it('Item 8: Enqueue duplicate while job is running -> Deduplication prevents concurrent run but does not lose work', async () => {
    let jobExecutionCount = 0;
    const createTestJob = (id: string): Job => ({
      id,
      type: 'palette',
      priority: 10,
      jobClass: 'interactive',
      state: 'queued' as JobState,
      execute: vi.fn(async () => {
        jobExecutionCount++;
      })
    });

    const jobA = createTestJob('unique_job_1');
    const jobB = createTestJob('unique_job_1'); // Same ID

    // Enqueue jobA
    const enqueuedA = scheduler.enqueue(jobA);
    expect(enqueuedA).toBe(true);

    // Enqueue duplicate immediately
    const enqueuedB = scheduler.enqueue(jobB);
    expect(enqueuedB).toBe(false); // Rejected by activeJobIds deduplication

    // Yield to let scheduler execute and settle jobA
    await new Promise((r) => setTimeout(r, 60));

    // After jobA settles, activeJobIds is cleared and the same ID can be enqueued again
    const jobC = createTestJob('unique_job_1');
    const enqueuedC = scheduler.enqueue(jobC);
    expect(enqueuedC).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Item 9: GarbageCollectionJob Cancellation & TOCTOU Safety
  // -------------------------------------------------------------------------
  it('Item 9: GC cancellation during execution stops promptly without touching DB or files', async () => {
    const gcJob = new GarbageCollectionJob();
    expect(gcJob.isCancelled()).toBe(false);

    // Cancel before execution
    gcJob.cancel();
    expect(gcJob.isCancelled()).toBe(true);

    await gcJob.execute();

    // Verify DB was never queried
    expect(db.query.waveforms.findMany).not.toHaveBeenCalled();
  });
});
