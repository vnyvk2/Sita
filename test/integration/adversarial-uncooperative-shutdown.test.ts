import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'path';

import * as schema from '@main/db/schema';
import { songs, musicFolders } from '@main/db/schema';
import { ShutdownCoordinator } from '@main/lifecycle/ShutdownCoordinator';
import { JobScheduler } from '@main/workers/jobScheduler';
import type { Job, JobState } from '@main/workers/types';

vi.mock('@main/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
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
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');

  let client: any = await PGlite.create({ extensions: { pg_trgm, citext } });
  let dbInstance: any = drizzle(client, { schema });

  return {
    get db() {
      return dbInstance;
    },
    get client() {
      return client;
    },
    closeDatabaseInstance: async () => {
      if (client) {
        await client.close();
        client = null;
        dbInstance = null;
      }
    },
    reopenDatabaseInstanceForTesting: async () => {
      client = await PGlite.create({ extensions: { pg_trgm, citext } });
      dbInstance = drizzle(client, { schema });
      return { db: dbInstance, client };
    }
  };
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
    await client.query('CREATE EXTENSION IF NOT EXISTS citext;');
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    const migrationsFolder = path.resolve(__dirname, '../../resources/drizzle');
    await migrate(db, { migrationsFolder });

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
            duration: '180',
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
    expect(rogueWriteError.message).toMatch(/closed|cannot read|null/i);

    vi.useRealTimers();
  }, 15000);
});
