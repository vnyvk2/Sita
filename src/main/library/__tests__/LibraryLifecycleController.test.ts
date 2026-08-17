import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserSettings, saveUserSettings } from '../../db/queries/settings';
import { closeAllAbortControllers } from '../../fs/controlAbortControllers';
import { initializePassiveWatchers } from '../../fs/initializePassiveWatchers';
import libraryChangeTracker from '../LibraryChangeTracker';
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
    libraryChangeTracker.reset();

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

    it('accurately reports canAttachWatchers only in automatic mode', async () => {
      expect(controller.canAttachWatchers()).toBe(true);

      await controller.setScanMode('manual');
      expect(controller.canAttachWatchers()).toBe(false);

      await controller.setScanMode('startup');
      expect(controller.canAttachWatchers()).toBe(false);

      await controller.setScanMode('automatic');
      expect(controller.canAttachWatchers()).toBe(true);
    });
  });

  describe('Reactive Live Changes (Automatic Mode)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      controller.stopWatchers();
      vi.useRealTimers();
    });

    it('triggers a debounced scan when LibraryChangeTracker marks dirty in automatic mode', async () => {
      await controller.startWatchers();
      expect(mockScanner.scan).not.toHaveBeenCalled();

      libraryChangeTracker.markDirty({ path: 'C:/Music/NewSong.mp3', source: 'folder-watcher' });

      // Before debounce window
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockScanner.scan).not.toHaveBeenCalled();

      // After 2000ms debounce
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('coalesces rapid burst change events into a single scan execution', async () => {
      await controller.startWatchers();

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(500);
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });
      await vi.advanceTimersByTimeAsync(500);
      libraryChangeTracker.markDirty({ path: 'C:/Music/3.mp3' });
      await vi.advanceTimersByTimeAsync(500);

      expect(mockScanner.scan).not.toHaveBeenCalled();

      // Advance full 2000ms after last event
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('schedules and executes a follow-up scan when changes arrive while a scan is in-flight', async () => {
      await controller.initialize();
      mockScanner.scan.mockClear();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // File changes while Scan A is running (increments generation)
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });

      // Ensure no concurrent second scan was started yet
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Scan A finishes
      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveScanA!(mockCompletedSummary);

      // Advance follow-up debounce timer
      await vi.advanceTimersByTimeAsync(2000);

      // Scan B should have been triggered cleanly
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('does not trigger a follow-up scan if no changes occurred during an active scan', async () => {
      await controller.initialize();
      mockScanner.scan.mockClear();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Scan A finishes with NO new changes arriving during the scan
      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveScanA!(mockCompletedSummary);

      // Advance timers past debounce window
      await vi.advanceTimersByTimeAsync(5000);

      // No follow-up scan should have been scheduled
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('coalesces multiple change events arriving during an active scan into exactly one follow-up scan', async () => {
      await controller.initialize();
      mockScanner.scan.mockClear();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Multiple files change during Scan A
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });
      libraryChangeTracker.markDirty({ path: 'C:/Music/3.mp3' });
      libraryChangeTracker.markDirty({ path: 'C:/Music/4.mp3' });

      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveScanA!(mockCompletedSummary);

      await vi.advanceTimersByTimeAsync(2000);

      // Exactly 1 follow-up scan (total 2 scans)
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('clears pending debounce timer and avoids duplicate scan when user clicks Scan Now during debounce', async () => {
      await controller.startWatchers();

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(500);

      // User triggers manual scanNow while debounce is pending
      const scanPromise = controller.scanNow();
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      await scanPromise;

      // Advance timers past original debounce window
      await vi.advanceTimersByTimeAsync(5000);

      // No extra scan should execute
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger live scan on filesystem change when in startup mode', async () => {
      await controller.setScanMode('startup');

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('does NOT trigger live scan on filesystem change when in manual mode', async () => {
      await controller.setScanMode('manual');

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('clears pending debounce timer and pending state when transitioning automatic -> manual', async () => {
      await controller.startWatchers();

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(1000);

      await controller.setScanMode('manual');

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('clears pending debounce timer and pending state when transitioning automatic -> startup', async () => {
      await controller.startWatchers();

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(1000);

      await controller.setScanMode('startup');

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('clears pending debounce timer and removes listener during shutdown', async () => {
      await controller.startWatchers();

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(1000);

      await controller.shutdown();

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('schedules a follow-up scan when a filesystem change occurs during the startup automatic scan', async () => {
      let resolveStartupScan: (val: ScanSummary) => void;
      const startupScanPromise = new Promise<ScanSummary>((resolve) => {
        resolveStartupScan = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(startupScanPromise);

      // Trigger automatic startup initialization
      const initPromise = controller.initialize();
      await vi.waitFor(() => {
        expect(mockScanner.scan).toHaveBeenCalledTimes(1);
      });

      // Filesystem change arrives during startup scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/NewSong.mp3' });

      // Startup scan finishes
      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveStartupScan!(mockCompletedSummary);
      await initPromise;

      // Advance follow-up debounce timer
      await vi.advanceTimersByTimeAsync(2000);

      // Exactly 2 scans: 1 startup scan + 1 follow-up scan
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('does NOT trigger follow-up scan when mode is changed to manual during an active scan', async () => {
      await controller.startWatchers();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Filesystem change arrives during scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });

      // User transitions to manual mode while scan is in flight
      await controller.setScanMode('manual');

      // Scan A finishes
      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveScanA!(mockCompletedSummary);

      // Advance timers
      await vi.advanceTimersByTimeAsync(5000);

      // No follow-up scan should execute because mode is now manual
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('schedules a follow-up scan when an automatic scan is cancelled after filesystem changes occurred', async () => {
      await controller.startWatchers();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Filesystem change arrives during scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });

      // Scan A finishes with CANCELLED status
      mockScanner.scan.mockResolvedValueOnce(mockCancelledSummary);
      resolveScanA!(mockCancelledSummary);

      // Advance follow-up debounce timer
      await vi.advanceTimersByTimeAsync(2000);

      // Follow-up scan must occur so un-reconciled filesystem changes are not lost
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('resets follow-up debounce timer when new changes arrive during the follow-up debounce window', async () => {
      await controller.startWatchers();

      let resolveScanA: (val: ScanSummary) => void;
      const scanAPromise = new Promise<ScanSummary>((resolve) => {
        resolveScanA = resolve;
      });
      mockScanner.scan.mockReturnValueOnce(scanAPromise);

      // Trigger first scan
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Change arrives during Scan A
      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3' });

      // Scan A finishes
      mockScanner.scan.mockResolvedValueOnce(mockCompletedSummary);
      resolveScanA!(mockCompletedSummary);

      // 1000ms into the follow-up debounce window, another change arrives
      await vi.advanceTimersByTimeAsync(1000);
      libraryChangeTracker.markDirty({ path: 'C:/Music/3.mp3' });

      // At 2000ms total (1000ms after new change), Scan B should NOT have fired yet
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // At 3000ms total (2000ms after new change), Scan B fires
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('does NOT trigger follow-up scan when scanner internally calls libraryChangeTracker.reset() during scan completion', async () => {
      await controller.startWatchers();

      mockScanner.scan.mockImplementation(async () => {
        // Real scanner calls reset() on clean completion
        libraryChangeTracker.reset();
        return mockCompletedSummary;
      });

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Advance timers far past debounce window to ensure no follow-up scan runs
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger follow-up scan when scanner internally calls libraryChangeTracker.markDirty() without entry on error/cancellation', async () => {
      await controller.startWatchers();

      mockScanner.scan.mockImplementation(async () => {
        // Real scanner calls markDirty() with no arguments on failure/cancellation
        libraryChangeTracker.markDirty();
        return mockFailedSummary;
      });

      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Advance timers far past debounce window to ensure no follow-up scan runs
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger a live scan when IPC resetChangeState calls libraryChangeTracker.reset()', async () => {
      await controller.startWatchers();

      // Renderer calls resetChangeState
      libraryChangeTracker.reset();

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockScanner.scan).not.toHaveBeenCalled();
    });

    it('handles FAILED scan followed by a real filesystem event and executes a subsequent debounced scan', async () => {
      await controller.startWatchers();

      mockScanner.scan.mockImplementationOnce(async () => {
        libraryChangeTracker.markDirty();
        return mockFailedSummary;
      });

      // First scan fails
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Subsequent real filesystem event arrives
      mockScanner.scan.mockImplementationOnce(async () => {
        libraryChangeTracker.reset();
        return mockCompletedSummary;
      });

      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
    });

    it('handles CANCELLED scan followed by a real filesystem event and executes a subsequent debounced scan', async () => {
      await controller.startWatchers();

      mockScanner.scan.mockImplementationOnce(async () => {
        libraryChangeTracker.markDirty();
        return mockCancelledSummary;
      });

      // First scan cancelled
      libraryChangeTracker.markDirty({ path: 'C:/Music/1.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(1);

      // Subsequent real filesystem event arrives
      mockScanner.scan.mockImplementationOnce(async () => {
        libraryChangeTracker.reset();
        return mockCompletedSummary;
      });

      libraryChangeTracker.markDirty({ path: 'C:/Music/2.mp3', source: 'folder-watcher' });
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockScanner.scan).toHaveBeenCalledTimes(2);
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
