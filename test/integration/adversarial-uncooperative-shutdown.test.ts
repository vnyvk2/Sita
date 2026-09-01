import path from 'path';

import * as schema from '@main/db/schema';
import { songs, musicFolders } from '@main/db/schema';
import { ShutdownCoordinator } from '@main/lifecycle/ShutdownCoordinator';
import { JobScheduler } from '@main/workers/jobScheduler';
import type { Job, JobState } from '@main/workers/types';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@main/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@main/workers/adaptivePolicyEngine', () => ({
  adaptivePolicyEngine: { stop: vi.fn() }
}));

vi.mock('@main/library/LibraryLifecycleController', () => ({
  libraryLifecycleController: { shutdown: vi.fn() }
}));

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: { terminate: vi.fn() }
}));

vi.mock('@main/fs/controlAbortControllers', () => ({
  closeAllAbortControllers: vi.fn()
}));

vi.mock('@main/other/artworks', () => ({
  clearTempArtworkFolder: vi.fn()
}));

vi.mock('@main/other/discordRPC', () => ({
  clearDiscordRpcActivity: vi.fn()
}));

vi.mock('@main/saveLyricsToSong', () => ({
  savePendingSongLyrics: vi.fn()
}));

vi.mock('@main/updateSong/updateSongId3Tags', () => ({
  savePendingMetadataUpdates: vi.fn()
}));

// Real PGlite
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

import { db, closeDatabaseInstance } from '@main/db/db';

describe('Adversarial Investigation: Uncooperative Rogue Job vs 5-Second Shutdown Barrier', () => {
  beforeEach(async () => {
    ShutdownCoordinator.resetStateForTesting();
  });

  it('Proves what happens when a rogue job ignores cancel() and attempts DB write after all shutdown barriers (15s drain + 5s grace + 5s DB barrier = 25s)', async () => {
    vi.useFakeTimers();

    // 1. Setup real PGlite schema
    const { client } = await import('@main/db/db');

    const scheduler = new JobScheduler();
    scheduler.start();

    let rogueWriteError: any = null;
    let rogueWriteAttempted = false;
    let cancelWasCalled = false;

    const uncooperativeJob: Job = {
      id: 'rogue_uncooperative_job_25s',
      type: 'test_rogue',
      priority: 1,
      jobClass: 'background',
      state: 'queued' as JobState,
      cancel: () => {
        cancelWasCalled = true;
      },
      execute: async () => {
        // Long rogue work that attempts write after 30 seconds
        await new Promise((resolve) => setTimeout(resolve, 30000));
        rogueWriteAttempted = true;
        try {
          await db.insert(songs).values({
            title: 'Rogue Track',
            duration: 180,
            path: '/rogue/track.mp3',
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          });
        } catch (err) {
          rogueWriteError = err;
        }
      }
    };

    const { libraryScheduler } = await import('@main/workers/jobScheduler');
    vi.spyOn(libraryScheduler, 'stop').mockImplementation(() => scheduler.stop());

    scheduler.enqueue(uncooperativeJob);

    await vi.advanceTimersByTimeAsync(50);
    expect(scheduler.getRawMetrics().runningJobs).toBe(1);

    // 4. Initiate shutdown in background
    const shutdownPromise = ShutdownCoordinator.shutdown('test-adversarial-25s');

    // Step A: Advance past 15s drain wait -> scheduler aborts running jobs and calls cancel()
    await vi.advanceTimersByTimeAsync(16000);
    expect(cancelWasCalled).toBe(true);

    // Step B: Advance past 5s scheduler grace period
    await vi.advanceTimersByTimeAsync(6000);

    // Step C: Advance past 5s ShutdownCoordinator DB barrier -> DB closes
    await vi.advanceTimersByTimeAsync(6000);

    await shutdownPromise;

    // Advance to 30s when rogue job attempts write
    await vi.advanceTimersByTimeAsync(5000);

    expect(rogueWriteAttempted).toBe(true);
    // Empirical Result: DB was closed by shutdown, so rogue write after DB closure is rejected safely
    expect(rogueWriteError).not.toBeNull();
    // SQLite closed-connection error is "database is not open" (PGlite: "client has been closed")
    expect(rogueWriteError.message).toMatch(/closed|not open|cannot read|null/i);

    vi.useRealTimers();
  }, 15000);
});
