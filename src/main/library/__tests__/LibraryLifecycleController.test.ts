import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserSettings, saveUserSettings } from '../../db/queries/settings';
import { closeAllAbortControllers } from '../../fs/controlAbortControllers';
import { initializePassiveWatchers } from '../../fs/initializePassiveWatchers';
import { LibraryLifecycleController, type LibraryScanMode } from '../LibraryLifecycleController';
import type { LibraryScanner, ScanSummary } from '../LibraryScanner';

vi.mock('../LibraryScanner', () => ({
  default: {
    scan: vi.fn(),
    cancelScan: vi.fn(),
    getState: vi.fn()
  }
}));

vi.mock('../../db/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      userSettings: {
        findFirst: vi.fn()
      }
    }
  }
}));

vi.mock('../../db/queries/settings', () => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn()
}));

vi.mock('../../fs/initializePassiveWatchers', () => ({
  initializePassiveWatchers: vi.fn()
}));

vi.mock('../../fs/controlAbortControllers', () => ({
  closeAllAbortControllers: vi.fn(),
  saveAbortController: vi.fn(),
  getAbortController: vi.fn(),
  closeAbortController: vi.fn()
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('LibraryLifecycleController', () => {
  let mockScanner: {
    scan: ReturnType<typeof vi.fn>;
    cancelScan: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
  };
  let controller: LibraryLifecycleController;

  const mockCompletedSummary: ScanSummary = {
    status: 'COMPLETED',
    added: 2,
    modified: 1,
    removed: 0,
    unchanged: 10,
    skippedRoots: [],
    durationMs: 150
  };

  const mockCancelledSummary: ScanSummary = {
    status: 'CANCELLED',
    added: 0,
    modified: 0,
    removed: 0,
    unchanged: 0,
    skippedRoots: [],
    durationMs: 50
  };

  const mockFailedSummary: ScanSummary = {
    status: 'FAILED',
    added: 0,
    modified: 0,
    removed: 0,
    unchanged: 0,
    skippedRoots: [],
    durationMs: 80,
    error: 'Disk unmounted'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getUserSettings).mockResolvedValue({
      libraryScanMode: 'automatic'
    } as unknown as UserSettings);
    vi.mocked(saveUserSettings).mockResolvedValue(undefined as unknown as void);
    vi.mocked(initializePassiveWatchers).mockResolvedValue(undefined);

    mockScanner = {
      scan: vi.fn().mockResolvedValue(mockCompletedSummary),
      cancelScan: vi.fn().mockResolvedValue(true),
      getState: vi.fn().mockReturnValue('IDLE')
    };

    controller = new LibraryLifecycleController(mockScanner as unknown as LibraryScanner);
  });

  describe('Startup Initialization', () => {
    it('initializes in automatic mode: starts watchers and triggers startup scan', async () => {
      vi.mocked(getUserSettings).mockResolvedValueOnce({
        libraryScanMode: 'automatic'
      } as unknown as UserSettings);

      await controller.initialize();

      expect(initializePassiveWatchers).toHaveBeenCalledTimes(1);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(true);
      expect(controller.getScanMode()).toBe('automatic');
    });

    it('initializes in startup mode: ensures watchers stopped and triggers startup scan', async () => {
      vi.mocked(getUserSettings).mockResolvedValueOnce({
        libraryScanMode: 'startup'
      } as unknown as UserSettings);

      await controller.initialize();

      expect(closeAllAbortControllers).toHaveBeenCalledTimes(1);
      expect(initializePassiveWatchers).not.toHaveBeenCalled();
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('startup');
    });

    it('initializes in manual mode: ensures watchers stopped and does NOT trigger scan', async () => {
      vi.mocked(getUserSettings).mockResolvedValueOnce({
        libraryScanMode: 'manual'
      } as unknown as UserSettings);

      await controller.initialize();

      expect(closeAllAbortControllers).toHaveBeenCalledTimes(1);
      expect(initializePassiveWatchers).not.toHaveBeenCalled();
      expect(mockScanner.scan).not.toHaveBeenCalled();
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');
    });

    it('safely falls back to automatic mode if database query fails on startup', async () => {
      vi.mocked(getUserSettings).mockRejectedValueOnce(new Error('DB unreachable'));

      await controller.initialize();

      expect(initializePassiveWatchers).toHaveBeenCalledTimes(1);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(true);
      expect(controller.getScanMode()).toBe('automatic');
    });

    it('ignores second initialize call idempotently', async () => {
      vi.mocked(getUserSettings).mockResolvedValue({
        libraryScanMode: 'automatic'
      } as unknown as UserSettings);

      await controller.initialize();
      await controller.initialize();

      expect(initializePassiveWatchers).toHaveBeenCalledTimes(1);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('handles watcher initialization failure by resetting watchersActive to false', async () => {
      vi.mocked(initializePassiveWatchers).mockRejectedValueOnce(new Error('FS watcher failure'));

      await expect(controller.startWatchers()).rejects.toThrow('FS watcher failure');
      expect(controller.areWatchersActive()).toBe(false);
    });
  });

  describe('Runtime Mode Transitions', () => {
    it('transitions automatic -> manual: stops active watchers and persists setting', async () => {
      await controller.startWatchers();
      expect(controller.areWatchersActive()).toBe(true);

      await controller.setScanMode('manual');

      expect(saveUserSettings).toHaveBeenCalledWith({ libraryScanMode: 'manual' });
      expect(closeAllAbortControllers).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('transitions manual -> automatic: starts watchers and persists setting without immediate scan', async () => {
      await controller.setScanMode('manual');
      expect(controller.areWatchersActive()).toBe(false);

      await controller.setScanMode('automatic');

      expect(saveUserSettings).toHaveBeenCalledWith({ libraryScanMode: 'automatic' });
      expect(initializePassiveWatchers).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(true);
      expect(controller.getScanMode()).toBe('automatic');
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('transitions automatic -> startup: stops watchers and persists setting without immediate scan', async () => {
      await controller.startWatchers();

      await controller.setScanMode('startup');

      expect(saveUserSettings).toHaveBeenCalledWith({ libraryScanMode: 'startup' });
      expect(closeAllAbortControllers).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('startup');
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('transitions startup -> manual: unconditionally cleans up watchers', async () => {
      await controller.setScanMode('startup');
      await controller.setScanMode('manual');

      expect(saveUserSettings).toHaveBeenCalledWith({ libraryScanMode: 'manual' });
      expect(closeAllAbortControllers).toHaveBeenCalledTimes(2);
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');
      expect(initializePassiveWatchers).not.toHaveBeenCalled();
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('rolls back runtime policy when database persistence fails in setScanMode', async () => {
      // Start in manual mode
      await controller.setScanMode('manual');
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');

      // Attempt to transition to automatic, but DB save fails
      vi.mocked(saveUserSettings).mockRejectedValueOnce(new Error('DB write lock'));

      await expect(controller.setScanMode('automatic')).rejects.toThrow('DB write lock');

      // Watchers should have been rolled back to stopped (manual)
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');
    });

    it('does not persist to database when watcher activation fails in setScanMode', async () => {
      await controller.setScanMode('manual');
      vi.mocked(saveUserSettings).mockClear();

      vi.mocked(initializePassiveWatchers).mockRejectedValueOnce(new Error('Permission denied'));

      await expect(controller.setScanMode('automatic')).rejects.toThrow('Permission denied');

      // DB should never have been touched
      expect(saveUserSettings).not.toHaveBeenCalled();
      expect(controller.areWatchersActive()).toBe(false);
      expect(controller.getScanMode()).toBe('manual');
    });

    it('no-ops when transitioning to the current mode after initialization', async () => {
      vi.mocked(getUserSettings).mockResolvedValueOnce({
        libraryScanMode: 'automatic'
      } as unknown as UserSettings);
      await controller.initialize();

      vi.mocked(saveUserSettings).mockClear();
      await controller.setScanMode('automatic');

      expect(saveUserSettings).not.toHaveBeenCalled();
    });
  });

  describe('Scan Now & Invariants', () => {
    it('executes scanNow in manual mode and updates lastScanTime on completion', async () => {
      const summary = await controller.scanNow();

      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
      expect(summary.status).toBe('COMPLETED');
      expect(saveUserSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          lastScanTime: expect.any(Date)
        })
      );
    });

    it('does NOT record lastScanTime when scan is cancelled', async () => {
      mockScanner.scan.mockResolvedValueOnce(mockCancelledSummary);

      const summary = await controller.scanNow();

      expect(summary.status).toBe('CANCELLED');
      expect(saveUserSettings).not.toHaveBeenCalled();
    });

    it('does NOT record lastScanTime when scan fails', async () => {
      mockScanner.scan.mockResolvedValueOnce(mockFailedSummary);

      const summary = await controller.scanNow();

      expect(summary.status).toBe('FAILED');
      expect(saveUserSettings).not.toHaveBeenCalled();
    });

    it('returns existing in-flight promise when scanNow is called concurrently without duplicate scanner invocations', async () => {
      let resolveScan: (value: ScanSummary) => void;
      const scanPromise = new Promise<ScanSummary>((resolve) => {
        resolveScan = resolve;
      });

      mockScanner.scan.mockReturnValue(scanPromise);

      const call1 = controller.scanNow();
      const call2 = controller.scanNow();

      // Controller should only invoke the scanner ONCE and share the in-flight promise
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      resolveScan!(mockCompletedSummary);

      const [res1, res2] = await Promise.all([call1, call2]);
      expect(res1).toBe(mockCompletedSummary);
      expect(res2).toBe(mockCompletedSummary);
    });

    it('cancels scan via scanner delegate', async () => {
      const cancelled = await controller.cancelScan();
      expect(mockScanner.cancelScan).toHaveBeenCalledTimes(1);
      expect(cancelled).toBe(true);
    });

    it('shuts down cleanly by stopping watchers and cancelling scan', async () => {
      await controller.startWatchers();

      await controller.shutdown();

      expect(closeAllAbortControllers).toHaveBeenCalledTimes(1);
      expect(mockScanner.cancelScan).toHaveBeenCalledTimes(1);
      expect(controller.areWatchersActive()).toBe(false);
    });
  });
});
