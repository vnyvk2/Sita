import fs from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryScanner } from '../LibraryScanner';
import { getLibraryScanRoots } from '../getLibraryScanRoots';
import { fastDiskWalk } from '../fastDiskWalk';
import libraryChangeTracker from '../LibraryChangeTracker';

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('../getLibraryScanRoots', () => ({
  getLibraryScanRoots: vi.fn()
}));

vi.mock('../fastDiskWalk', () => ({
  fastDiskWalk: vi.fn()
}));

const { mockChangeTracker } = vi.hoisted(() => ({
  mockChangeTracker: {
    markDirty: vi.fn(),
    reset: vi.fn(),
    isDirty: vi.fn().mockReturnValue(false)
  }
}));

vi.mock('../LibraryChangeTracker', () => ({
  default: mockChangeTracker,
  libraryChangeTracker: mockChangeTracker
}));

vi.mock('@main/db/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([])
    })
  }
}));

describe('Scanner Cancellation Lifecycle (B-7)', () => {
  let mockReconciler: any;
  let scanner: LibraryScanner;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReconciler = {
      reconcileAdded: vi.fn().mockResolvedValue({ successCount: 1, errorCount: 0, errors: [] }),
      reconcileModified: vi.fn().mockResolvedValue({ successCount: 0, errorCount: 0, errors: [] }),
      reconcileRemoved: vi.fn().mockResolvedValue({ successCount: 0, errorCount: 0, errors: [] })
    };
    scanner = new LibraryScanner(mockReconciler);
  });

  it('should abort cleanly during DISCOVERING phase and preserve dirty state', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);

    vi.mocked(fastDiskWalk).mockImplementation(async (_roots, options) => {
      // Simulate user clicking cancel while disk walk is running
      scanner.cancelScan();
      expect(options?.abortSignal?.aborted).toBe(true);
      return { snapshots: [], failedSubtrees: [], failedPaths: [] };
    });

    const summary = await scanner.scan();

    expect(summary.status).toBe('CANCELLED');
    expect(mockReconciler.reconcileAdded).not.toHaveBeenCalled();
    expect(mockReconciler.reconcileModified).not.toHaveBeenCalled();
    expect(mockReconciler.reconcileRemoved).not.toHaveBeenCalled();
    expect(mockChangeTracker.markDirty).toHaveBeenCalled();
    expect(mockChangeTracker.reset).not.toHaveBeenCalled();
  });

  it('should abort cleanly during RECONCILING phase and stop subsequent reconciliations', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockResolvedValue({
      snapshots: [
        { path: 'C:\\Music\\Song1.mp3', fileModifiedAt: new Date(), rootId: 1 },
        { path: 'C:\\Music\\Song2.mp3', fileModifiedAt: new Date(), rootId: 1 }
      ],
      failedSubtrees: [],
      failedPaths: []
    });

    mockReconciler.reconcileAdded.mockImplementation(async (_added: any, _roots: any, options: any) => {
      // User cancels during additions reconciliation
      scanner.cancelScan();
      expect(options?.abortSignal?.aborted).toBe(true);
      return { successCount: 1, errorCount: 0, errors: [], cancelled: true };
    });

    const summary = await scanner.scan();

    expect(summary.status).toBe('CANCELLED');
    expect(mockReconciler.reconcileModified).not.toHaveBeenCalled();
    expect(mockChangeTracker.markDirty).toHaveBeenCalled();
  });
});
