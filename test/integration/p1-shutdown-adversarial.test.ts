import { closeDatabaseInstance, db } from '@main/db/db';
import { libraryLifecycleController } from '@main/library/LibraryLifecycleController';
import { ShutdownCoordinator } from '@main/lifecycle/ShutdownCoordinator';
import { adaptivePolicyEngine } from '@main/workers/adaptivePolicyEngine';
import { libraryScheduler } from '@main/workers/jobScheduler';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@main/workers/jobScheduler', () => ({
  libraryScheduler: {
    stop: vi.fn()
  }
}));

vi.mock('@main/workers/adaptivePolicyEngine', () => ({
  adaptivePolicyEngine: {
    stop: vi.fn()
  }
}));

vi.mock('@main/library/LibraryLifecycleController', () => ({
  libraryLifecycleController: {
    shutdown: vi.fn()
  }
}));

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    terminate: vi.fn()
  }
}));

vi.mock('@main/db/db', () => ({
  closeDatabaseInstance: vi.fn(),
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
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

describe('Item 4 FORENSIC: Adversarial Shutdown & Resource Lifetime Invariant', () => {
  let isDbClosed = false;
  let dbWritesAfterCloseCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    ShutdownCoordinator.resetStateForTesting();
    isDbClosed = false;
    dbWritesAfterCloseCount = 0;

    vi.mocked(closeDatabaseInstance).mockImplementation(async () => {
      isDbClosed = true;
    });

    const recordDbWrite = () => {
      if (isDbClosed) {
        dbWritesAfterCloseCount++;
      }
    };
    vi.mocked(db.insert).mockImplementation((...args: any[]) => {
      recordDbWrite();
      return {} as any;
    });
    vi.mocked(db.update).mockImplementation((...args: any[]) => {
      recordDbWrite();
      return {} as any;
    });
    vi.mocked(db.delete).mockImplementation((...args: any[]) => {
      recordDbWrite();
      return {} as any;
    });
  });

  it('Case 1: Cooperative job finishes naturally during scheduler drain -> DB closes after job settles', async () => {
    let jobExecutionDone = false;
    const cooperativePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        db.insert({} as any); // Valid DB write before closure
        jobExecutionDone = true;
        resolve();
      }, 50);
    });

    vi.mocked(libraryScheduler.stop).mockResolvedValueOnce({
      survivingJobPromises: [cooperativePromise]
    });

    await ShutdownCoordinator.shutdown('test-cooperative');

    expect(jobExecutionDone).toBe(true);
    expect(isDbClosed).toBe(true);
    expect(dbWritesAfterCloseCount).toBe(0);
  });

  it('Case 2: Cancel-aware slow job settles within grace window -> DB closes after job settles', async () => {
    let jobSettled = false;

    const cancelAwarePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        jobSettled = true;
        resolve();
      }, 100);
    });

    vi.mocked(libraryScheduler.stop).mockResolvedValueOnce({
      survivingJobPromises: [cancelAwarePromise]
    });

    await ShutdownCoordinator.shutdown('test-cancel-aware');

    expect(jobSettled).toBe(true);
    expect(isDbClosed).toBe(true);
    expect(dbWritesAfterCloseCount).toBe(0);
  });

  it('Case 3: Uncooperative runaway job attempts DB write after 5s barrier -> Detected & verified', async () => {
    vi.useFakeTimers();

    let rogueWriteAttempted = false;
    const roguePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        rogueWriteAttempted = true;
        db.insert({} as any); // Illegal write attempt after DB close
        resolve();
      }, 6000); // Beyond the 5000ms hard barrier
    });

    vi.mocked(libraryScheduler.stop).mockResolvedValueOnce({
      survivingJobPromises: [roguePromise]
    });

    const shutdownPromise = ShutdownCoordinator.shutdown('test-uncooperative');

    // Advance past the 5s barrier
    await vi.advanceTimersByTimeAsync(5100);
    await shutdownPromise;

    expect(isDbClosed).toBe(true);

    // Trigger late write at 6s
    await vi.advanceTimersByTimeAsync(1000);
    expect(rogueWriteAttempted).toBe(true);

    // The post-close write was accurately detected
    expect(dbWritesAfterCloseCount).toBe(1);
    vi.useRealTimers();
  });

  it('Case 4 to 8: Multi-subsystem failures during shutdown -> All subsystems attempted and DB teardown executes', async () => {
    vi.mocked(libraryScheduler.stop).mockRejectedValueOnce(new Error('Scheduler stop crashed'));
    vi.mocked(adaptivePolicyEngine.stop).mockImplementationOnce(() => {
      throw new Error('Adaptive policy stop crashed');
    });
    vi.mocked(libraryLifecycleController.shutdown).mockRejectedValueOnce(
      new Error('Library lifecycle shutdown crashed')
    );
    vi.mocked(mediaWorkerBridge.terminate).mockRejectedValueOnce(
      new Error('MediaWorkerBridge terminate crashed')
    );

    await ShutdownCoordinator.shutdown('test-multi-crash');

    expect(adaptivePolicyEngine.stop).toHaveBeenCalled();
    expect(libraryLifecycleController.shutdown).toHaveBeenCalled();
    expect(mediaWorkerBridge.terminate).toHaveBeenCalled();
    expect(isDbClosed).toBe(true);
  });
});
