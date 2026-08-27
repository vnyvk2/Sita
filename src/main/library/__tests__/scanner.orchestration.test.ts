import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryScanner } from '../LibraryScanner';
import { getLibraryScanRoots } from '../getLibraryScanRoots';
import { fastDiskWalk } from '../fastDiskWalk';

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

describe('LibraryScanner Orchestration (B-5a)', () => {
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

  it('Single Active Scan Invariant: should return the identical promise when scan is called concurrently', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { snapshots: [], failedSubtrees: [], failedPaths: [] };
    });

    const promise1 = scanner.scan();
    const promise2 = scanner.scan();

    expect(promise1).toBe(promise2);

    const result = await promise1;
    expect(result.status).toBe('COMPLETED');
  });

  it('State Machine Progression: should transition through DISCOVERING, DIFFING, RECONCILING, and COMPLETED', async () => {
    const states: string[] = [];
    scanner.on('progress', (p) => {
      if (!states.includes(p.state)) states.push(p.state);
    });

    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockResolvedValue({
      snapshots: [{ path: 'C:\\Music\\Song1.mp3', fileModifiedAt: new Date(), rootId: 1 }],
      failedSubtrees: [],
      failedPaths: []
    });

    const summary = await scanner.scan();

    expect(states).toContain('DISCOVERING');
    expect(states).toContain('DIFFING');
    expect(states).toContain('RECONCILING');
    expect(states).toContain('COMPLETED');
    expect(summary.status).toBe('COMPLETED');
    expect(mockChangeTracker.reset).toHaveBeenCalled();
  });

  it('Dry Run Mode: should calculate diff without calling reconciler', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockResolvedValue({
      snapshots: [{ path: 'C:\\Music\\Song1.mp3', fileModifiedAt: new Date(), rootId: 1 }],
      failedSubtrees: [],
      failedPaths: []
    });

    const summary = await scanner.scan({ dryRun: true });

    expect(mockReconciler.reconcileAdded).not.toHaveBeenCalled();
    expect(summary.added).toBe(1);
    expect(summary.status).toBe('COMPLETED');
  });

  it('Cancellation: should halt scan, return CANCELLED status, and mark change tracker dirty', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockImplementation(async () => {
      scanner.cancelScan();
      return { snapshots: [], failedSubtrees: [], failedPaths: [] };
    });

    const summary = await scanner.scan();

    expect(summary.status).toBe('CANCELLED');
    expect(mockChangeTracker.markDirty).toHaveBeenCalled();
  });

  it('Failure Recovery: should mark tracker dirty and return FAILED status on errors', async () => {
    vi.mocked(getLibraryScanRoots).mockResolvedValue([{ id: 1, path: 'C:\\Music' }]);
    vi.mocked(fastDiskWalk).mockResolvedValue({
      snapshots: [{ path: 'C:\\Music\\Corrupt.mp3', fileModifiedAt: new Date(), rootId: 1 }],
      failedSubtrees: ['C:\\Music\\Unreadable'],
      failedPaths: []
    });

    mockReconciler.reconcileAdded.mockResolvedValue({
      successCount: 0,
      errorCount: 1,
      errors: [{ path: 'C:\\Music\\Corrupt.mp3', error: 'Failed' }]
    });

    const summary = await scanner.scan();

    expect(summary.status).toBe('FAILED');
    expect(mockChangeTracker.markDirty).toHaveBeenCalled();
  });
});
