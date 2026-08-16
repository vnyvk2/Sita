import { describe, it, expect, beforeEach, vi } from 'vitest';

import libraryChangeTracker from '../LibraryChangeTracker';
import { LibraryReconciler } from '../LibraryReconciler';
import { LibraryScanner } from '../LibraryScanner';

vi.mock('../getLibraryScanRoots', () => ({
  getLibraryScanRoots: vi.fn().mockResolvedValue([{ id: 1, path: 'C:\\TestMusic' }])
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../fastDiskWalk', () => ({
  fastDiskWalk: vi.fn().mockResolvedValue({
    snapshots: [
      {
        path: 'C:\\TestMusic\\SongA.mp3',
        fileModifiedAt: new Date(10000),
        rootId: 1,
        dirPath: 'C:\\TestMusic'
      }
    ],
    failedSubtrees: [],
    failedPaths: []
  })
}));

vi.mock('@main/db/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    })
  }
}));

describe('LibraryScanner', () => {
  let mockReconciler: LibraryReconciler;
  let scanner: LibraryScanner;

  beforeEach(() => {
    vi.clearAllMocks();
    libraryChangeTracker.reset();

    mockReconciler = {
      reconcileAdded: vi.fn().mockResolvedValue({ successCount: 1, errorCount: 0, errors: [] }),
      reconcileModified: vi.fn().mockResolvedValue({ successCount: 0, errorCount: 0, errors: [] }),
      reconcileRemoved: vi.fn().mockResolvedValue({ successCount: 0, errorCount: 0, errors: [] })
    } as unknown as LibraryReconciler;

    scanner = new LibraryScanner(mockReconciler);
  });

  it('should initialize in IDLE state', () => {
    expect(scanner.getState()).toBe('IDLE');
  });

  it('should complete a scan, invoke reconciler, and reset dirty state (Contract 6 & 7)', async () => {
    libraryChangeTracker.markDirty();
    expect(libraryChangeTracker.getState().isDirty).toBe(true);

    const summary = await scanner.scan();

    expect(summary.status).toBe('COMPLETED');
    expect(summary.added).toBe(1);
    expect(mockReconciler.reconcileAdded).toHaveBeenCalledTimes(1);
    expect(libraryChangeTracker.getState().isDirty).toBe(false);
  });

  it('should obey Contract 8 (Single Active Scan Invariant)', async () => {
    const scan1 = scanner.scan();
    const scan2 = scanner.scan();

    expect(scan1).toBe(scan2);

    const summary = await scan1;
    expect(summary.status).toBe('COMPLETED');
  });

  it('should support dry-run mode without invoking reconciler mutations', async () => {
    libraryChangeTracker.markDirty();

    const summary = await scanner.scan({ dryRun: true });

    expect(summary.status).toBe('COMPLETED');
    expect(summary.added).toBe(1);
    expect(mockReconciler.reconcileAdded).not.toHaveBeenCalled();
    // Dry run does not reset dirty state
    expect(libraryChangeTracker.getState().isDirty).toBe(true);
  });

  it('should handle cancellation, return CANCELLED status, and preserve dirty state', async () => {
    libraryChangeTracker.markDirty();

    const scanPromise = scanner.scan();
    const cancelled = scanner.cancelScan();

    expect(cancelled).toBe(true);

    const summary = await scanPromise;
    expect(summary.status).toBe('CANCELLED');
    expect(libraryChangeTracker.getState().isDirty).toBe(true);
  });

  it('should report FAILED and preserve dirty state when reconciliation has errors', async () => {
    libraryChangeTracker.markDirty();

    mockReconciler.reconcileAdded = vi.fn().mockResolvedValue({
      successCount: 0,
      errorCount: 1,
      errors: [{ path: 'C:\\TestMusic\\SongA.mp3', error: 'Tag read error' }]
    });

    const summary = await scanner.scan();

    expect(summary.status).toBe('FAILED');
    expect(libraryChangeTracker.getState().isDirty).toBe(true);
  });
});
