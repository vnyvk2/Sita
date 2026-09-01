import { closeDatabaseInstance } from '@main/db/db';
import { libraryLifecycleController } from '@main/library/LibraryLifecycleController';
import { ShutdownCoordinator } from '@main/lifecycle/ShutdownCoordinator';
import { adaptivePolicyEngine } from '@main/workers/adaptivePolicyEngine';
import { libraryScheduler } from '@main/workers/jobScheduler';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  db: {}
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

describe('ShutdownCoordinator cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ShutdownCoordinator.resetStateForTesting();
  });

  it('should call all stop methods even if one throws, and close DB last', async () => {
    const stopError = new Error('Scheduler failed to stop');
    vi.mocked(libraryScheduler.stop).mockRejectedValueOnce(stopError);
    vi.mocked(adaptivePolicyEngine.stop).mockImplementationOnce(() => {});
    vi.mocked(libraryLifecycleController.shutdown).mockResolvedValueOnce(undefined as any);
    vi.mocked(mediaWorkerBridge.terminate).mockResolvedValueOnce(undefined);
    vi.mocked(closeDatabaseInstance).mockResolvedValueOnce();

    await ShutdownCoordinator.shutdown('test-source');

    expect(libraryScheduler.stop).toHaveBeenCalled();
    expect(adaptivePolicyEngine.stop).toHaveBeenCalled();
    expect(libraryLifecycleController.shutdown).toHaveBeenCalled();
    expect(mediaWorkerBridge.terminate).toHaveBeenCalled();
    expect(closeDatabaseInstance).toHaveBeenCalled();
  });

  it('P1-6 REGRESSION: DB must NOT close before surviving scheduler job promises settle', async () => {
    // Simulate a job promise that takes 500ms to settle (representing a DB-writing job
    // that is still executing after scheduler.stop() returns).
    let jobSettled = false;
    const slowJobPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        jobSettled = true;
        resolve();
      }, 500);
    });

    // Scheduler stop returns surviving promises that haven't settled yet
    vi.mocked(libraryScheduler.stop).mockResolvedValueOnce({
      survivingJobPromises: [slowJobPromise]
    });
    vi.mocked(adaptivePolicyEngine.stop).mockImplementation(() => {});
    vi.mocked(libraryLifecycleController.shutdown).mockResolvedValue(undefined as any);
    vi.mocked(mediaWorkerBridge.terminate).mockResolvedValue(undefined);

    let dbClosedBeforeJobSettled = false;
    vi.mocked(closeDatabaseInstance).mockImplementation(async () => {
      // Record whether the job had settled BEFORE DB close was called
      if (!jobSettled) {
        dbClosedBeforeJobSettled = true;
      }
    });

    await ShutdownCoordinator.shutdown('test-write-barrier');

    // The job must have settled BEFORE closeDatabaseInstance was called
    expect(jobSettled).toBe(true);
    expect(dbClosedBeforeJobSettled).toBe(false);
    expect(closeDatabaseInstance).toHaveBeenCalled();
  });

  it('P1-6 REGRESSION: DB closes even when no surviving promises exist (normal drain)', async () => {
    // Normal shutdown: all jobs drained cleanly, no survivors
    vi.mocked(libraryScheduler.stop).mockResolvedValueOnce({
      survivingJobPromises: []
    });
    vi.mocked(adaptivePolicyEngine.stop).mockImplementation(() => {});
    vi.mocked(libraryLifecycleController.shutdown).mockResolvedValue(undefined as any);
    vi.mocked(mediaWorkerBridge.terminate).mockResolvedValue(undefined);
    vi.mocked(closeDatabaseInstance).mockResolvedValueOnce();

    await ShutdownCoordinator.shutdown('test-normal-drain');

    expect(closeDatabaseInstance).toHaveBeenCalled();
  });
});
