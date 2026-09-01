import { EventEmitter } from 'events';
import fs from 'fs/promises';

import { db } from '@main/db/db';
import { songs } from '@main/db/schema';

import logger from '../logger';
import {
  diffFilesystemSnapshot,
  type DbSongSnapshot,
  type DiffResult,
  type ScanRoot
} from './diffEngine';
import { fastDiskWalk } from './fastDiskWalk';
import { getLibraryScanRoots } from './getLibraryScanRoots';
import libraryChangeTracker from './LibraryChangeTracker';
import libraryReconciler, { LibraryReconciler } from './LibraryReconciler';

export type ScannerState =
  | 'IDLE'
  | 'DISCOVERING'
  | 'DIFFING'
  | 'RECONCILING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface ScanOptions {
  dryRun?: boolean;
}

export interface ScannerProgress {
  state: ScannerState;
  discoveredFiles?: number;
  totalToReconcile?: number;
  completedReconciliation?: number;
  addedCount?: number;
  modifiedCount?: number;
  removedCount?: number;
  currentPath?: string;
}

export interface ScanSummary {
  status: 'COMPLETED' | 'CANCELLED' | 'FAILED';
  added: number;
  modified: number;
  removed: number;
  unchanged: number;
  skippedRoots: ScanRoot[];
  failedSubtrees?: string[];
  failedPaths?: string[];
  durationMs: number;
  error?: string;
}

export class LibraryScanner extends EventEmitter {
  private state: ScannerState = 'IDLE';
  private activeScanPromise: Promise<ScanSummary> | null = null;
  private activeAbortController: AbortController | null = null;
  private reconciler: LibraryReconciler;

  constructor(reconciler: LibraryReconciler = libraryReconciler) {
    super();
    this.reconciler = reconciler;
  }

  public getState(): ScannerState {
    return this.state;
  }

  private setState(newState: ScannerState, extraProgress?: Partial<ScannerProgress>): void {
    this.state = newState;
    const progress: ScannerProgress = {
      state: this.state,
      ...extraProgress
    };
    this.emit('progress', progress);
  }

  /**
   * Initiates a library scan according to Contract 8 (Single Active Scan Invariant). If a scan is
   * already running, returns the existing active scan promise.
   */
  public scan(options: ScanOptions = {}): Promise<ScanSummary> {
    if (this.activeScanPromise) {
      logger.warn(
        '[LibraryScanner] A library scan is already active. Returning existing scan promise.'
      );
      return this.activeScanPromise;
    }

    this.activeAbortController = new AbortController();
    const abortSignal = this.activeAbortController.signal;
    const startTime = Date.now();

    this.activeScanPromise = this.executeScan(options, abortSignal, startTime).finally(() => {
      this.activeScanPromise = null;
      this.activeAbortController = null;
    });

    return this.activeScanPromise;
  }

  public cancelScan(): boolean {
    if (this.activeAbortController && !this.activeAbortController.signal.aborted) {
      logger.info('[LibraryScanner] Cancelling active library scan...');
      this.activeAbortController.abort();
      return true;
    }
    return false;
  }

  private async executeScan(
    options: ScanOptions,
    abortSignal: AbortSignal,
    startTime: number
  ): Promise<ScanSummary> {
    const { dryRun = false } = options;
    logger.info(`[LibraryScanner] Starting library scan (dryRun: ${dryRun})...`);

    try {
      // ----------------------------------------------------
      // PHASE 1: DISCOVERING ROOTS & PROBING HEALTH (100% Read-Only)
      // ----------------------------------------------------
      performance.mark('scanner:discover-start');
      this.setState('DISCOVERING', { discoveredFiles: 0 });

      const configuredRoots = await getLibraryScanRoots();
      const accessibleRoots: ScanRoot[] = [];
      const skippedRoots: ScanRoot[] = [];

      for (const root of configuredRoots) {
        if (abortSignal.aborted) break;
        try {
          await fs.access(root.path);
          accessibleRoots.push(root);
        } catch {
          logger.warn(
            `[LibraryScanner] Root '${root.path}' is inaccessible/disconnected. Skipping root for safety.`
          );
          skippedRoots.push(root);
        }
      }

      if (abortSignal.aborted) {
        return this.handleCancellation(startTime, skippedRoots);
      }

      // Fast single-pass disk traversal across accessible roots with subtree & stat failure safety
      const walkResult = await fastDiskWalk(accessibleRoots, {
        abortSignal,
        onFileDiscovered: (count, currentPath) => {
          this.setState('DISCOVERING', { discoveredFiles: count, currentPath });
        }
      });

      performance.mark('scanner:discover-end');
      try {
        performance.measure('scanner:discover', 'scanner:discover-start', 'scanner:discover-end');
      } catch {
        // Ignore performance measure errors
      }

      if (abortSignal.aborted || walkResult.cancelled) {
        return this.handleCancellation(startTime, skippedRoots);
      }

      const { snapshots: diskSnapshots, failedSubtrees, failedPaths } = walkResult;

      logger.info('[LibraryScanner] Discovery complete', {
        executionMode: walkResult.executionMode,
        discoveredFiles: diskSnapshots.length,
        failedSubtreesCount: failedSubtrees.length,
        failedPathsCount: failedPaths.length,
        durationMs: walkResult.durationMs
      });

      // ----------------------------------------------------
      // PHASE 2: DIFFING (Pure In-Memory Diff Engine)
      // ----------------------------------------------------
      performance.mark('scanner:diff-start');
      this.setState('DIFFING', { discoveredFiles: diskSnapshots.length });

      // Fetch 1 flat DB snapshot (including blacklisted tracks for path diff matching)
      const dbSongs = await db
        .select({
          id: songs.id,
          path: songs.path,
          fileModifiedAt: songs.fileModifiedAt,
          folderId: songs.folderId,
          isBlacklisted: songs.isBlacklisted
        })
        .from(songs);

      const dbSnapshots: DbSongSnapshot[] = dbSongs.map((s) => ({
        id: s.id,
        path: s.path,
        fileModifiedAt: s.fileModifiedAt,
        folderId: s.folderId,
        isBlacklisted: s.isBlacklisted
      }));

      const diff: DiffResult = diffFilesystemSnapshot(diskSnapshots, dbSnapshots, accessibleRoots, {
        skippedRoots,
        failedSubtrees,
        failedPaths
      });

      performance.mark('scanner:diff-end');
      try {
        performance.measure('scanner:diff', 'scanner:diff-start', 'scanner:diff-end');
      } catch {
        // Ignore performance measure errors
      }

      logger.info('[LibraryScanner] Diff calculated.', {
        added: diff.added.length,
        modified: diff.modified.length,
        removed: diff.removed.length,
        unchanged: diff.unchangedCount,
        skippedRoots: diff.skippedRoots.length,
        failedSubtrees: diff.failedSubtrees.length,
        failedPaths: diff.failedPaths.length
      });

      if (abortSignal.aborted) {
        return this.handleCancellation(startTime, skippedRoots);
      }

      // ----------------------------------------------------
      // PHASE 3: RECONCILING (Batch Mutations & Error Tracking)
      // ----------------------------------------------------
      performance.mark('scanner:reconcile-start');
      const totalToReconcile = diff.added.length + diff.modified.length + diff.removed.length;
      let completedReconciliation = 0;
      let reconciliationErrors = 0;

      if (!dryRun && totalToReconcile > 0) {
        this.setState('RECONCILING', {
          totalToReconcile,
          completedReconciliation: 0,
          addedCount: diff.added.length,
          modifiedCount: diff.modified.length,
          removedCount: diff.removed.length
        });

        // 1. Reconcile Removals first to avoid collisions
        if (diff.removed.length > 0 && !abortSignal.aborted) {
          const result = await this.reconciler.reconcileRemoved(diff.removed, {
            abortSignal,
            onProgress: (p) => {
              this.setState('RECONCILING', {
                totalToReconcile,
                completedReconciliation: completedReconciliation + p.completed,
                currentPath: p.currentPath
              });
            }
          });
          completedReconciliation += result.successCount;
          reconciliationErrors += result.errorCount;
        }

        // 2. Reconcile Additions (Resolves/Creates folder hierarchy strictly during reconciliation)
        if (diff.added.length > 0 && !abortSignal.aborted) {
          const result = await this.reconciler.reconcileAdded(diff.added, accessibleRoots, {
            abortSignal,
            onProgress: (p) => {
              this.setState('RECONCILING', {
                totalToReconcile,
                completedReconciliation: completedReconciliation + p.completed,
                currentPath: p.currentPath
              });
            }
          });
          completedReconciliation += result.successCount;
          reconciliationErrors += result.errorCount;
        }

        // 3. Reconcile Modifications
        if (diff.modified.length > 0 && !abortSignal.aborted) {
          const result = await this.reconciler.reconcileModified(diff.modified, {
            abortSignal,
            onProgress: (p) => {
              this.setState('RECONCILING', {
                totalToReconcile,
                completedReconciliation: completedReconciliation + p.completed,
                currentPath: p.currentPath
              });
            }
          });
          completedReconciliation += result.successCount;
          reconciliationErrors += result.errorCount;
        }
      }

      performance.mark('scanner:reconcile-end');
      try {
        performance.measure(
          'scanner:reconcile',
          'scanner:reconcile-start',
          'scanner:reconcile-end'
        );
      } catch {
        // Ignore performance measure errors
      }

      if (abortSignal.aborted) {
        return this.handleCancellation(startTime, skippedRoots);
      }

      // ----------------------------------------------------
      // PHASE 4: COMPLETION
      // ----------------------------------------------------
      const hasErrors =
        reconciliationErrors > 0 || failedSubtrees.length > 0 || failedPaths.length > 0;

      if (!dryRun) {
        if (hasErrors) {
          logger.warn(
            `[LibraryScanner] Scan completed with ${reconciliationErrors} errors, ${failedSubtrees.length} failed subtrees, ${failedPaths.length} failed stats. Preserving dirty state.`
          );
          libraryChangeTracker.markDirty();
        } else {
          libraryChangeTracker.reset(); // isDirty -> false
        }
      }

      this.setState(hasErrors ? 'FAILED' : 'COMPLETED', {
        totalToReconcile,
        completedReconciliation
      });

      const summary: ScanSummary = {
        status: hasErrors ? 'FAILED' : 'COMPLETED',
        added: diff.added.length,
        modified: diff.modified.length,
        removed: diff.removed.length,
        unchanged: diff.unchangedCount,
        skippedRoots: diff.skippedRoots,
        failedSubtrees: diff.failedSubtrees,
        failedPaths: diff.failedPaths,
        durationMs: Date.now() - startTime,
        error: hasErrors ? `${reconciliationErrors} errors during reconciliation` : undefined
      };

      this.setState('IDLE');
      return summary;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[LibraryScanner] Library scan failed', { error });

      libraryChangeTracker.markDirty(); // Failure keeps isDirty = true
      this.setState('FAILED');
      this.setState('IDLE');

      return {
        status: 'FAILED',
        added: 0,
        modified: 0,
        removed: 0,
        unchanged: 0,
        skippedRoots: [],
        durationMs: Date.now() - startTime,
        error: errorMsg
      };
    }
  }

  private handleCancellation(startTime: number, skippedRoots: ScanRoot[]): ScanSummary {
    logger.warn('[LibraryScanner] Library scan cancelled by user.');
    libraryChangeTracker.markDirty(); // Cancellation preserves isDirty = true
    this.setState('CANCELLED');
    this.setState('IDLE');

    return {
      status: 'CANCELLED',
      added: 0,
      modified: 0,
      removed: 0,
      unchanged: 0,
      skippedRoots,
      durationMs: Date.now() - startTime
    };
  }
}

export const libraryScanner = new LibraryScanner();
export default libraryScanner;
