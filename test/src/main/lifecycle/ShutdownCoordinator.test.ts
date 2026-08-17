import { closeDatabaseInstance } from '@main/db/db';
import { closeAllAbortControllers } from '@main/fs/controlAbortControllers';
import { libraryLifecycleController } from '@main/library/LibraryLifecycleController';
import { ShutdownCoordinator } from '@main/lifecycle/ShutdownCoordinator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@main/workers/jobScheduler', () => ({
  libraryScheduler: { stop: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('@main/workers/adaptivePolicyEngine', () => ({
  adaptivePolicyEngine: { stop: vi.fn() }
}));
vi.mock('@main/library/LibraryLifecycleController', () => ({
  libraryLifecycleController: {
    shutdown: vi.fn().mockResolvedValue(undefined)
  }
}));
vi.mock('@main/other/discordRPC', () => ({
  clearDiscordRpcActivity: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@main/saveLyricsToSong', () => ({
  savePendingSongLyrics: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@main/updateSong/updateSongId3Tags', () => ({
  savePendingMetadataUpdates: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@main/fs/controlAbortControllers', () => ({
  closeAllAbortControllers: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@main/other/artworks', () => ({
  clearTempArtworkFolder: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@main/db/db', () => ({
  closeDatabaseInstance: vi.fn().mockResolvedValue(undefined)
}));

describe('ShutdownCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ShutdownCoordinator.resetStateForTesting();
  });

  it('should start with isShuttingDown() returning false', () => {
    expect(ShutdownCoordinator.isShuttingDown()).toBe(false);
  });

  it('should execute shutdown and allow resetting state for testing', async () => {
    const promise = ShutdownCoordinator.shutdown('test-source');
    expect(ShutdownCoordinator.isShuttingDown()).toBe(true);
    await promise;
    expect(ShutdownCoordinator.isShuttingDown()).toBe(true);

    expect(libraryLifecycleController.shutdown).toHaveBeenCalledTimes(1);
    expect(closeDatabaseInstance).toHaveBeenCalledTimes(1);

    ShutdownCoordinator.resetStateForTesting();
    expect(ShutdownCoordinator.isShuttingDown()).toBe(false);
  });

  it('should be idempotent and return the same promise for concurrent calls', async () => {
    const p1 = ShutdownCoordinator.shutdown('source-1');
    const p2 = ShutdownCoordinator.shutdown('source-2');
    expect(p1).toBe(p2);
    await Promise.all([p1, p2]);

    expect(libraryLifecycleController.shutdown).toHaveBeenCalledTimes(1);
  });
});
