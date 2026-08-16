import { processSongsWithWorkerPool } from '../core/songWorkerPool';
import logger from '../logger';
import reParseSong from '../parseSong/reParseSong';
import removeSongsFromLibrary from '../removeSongsFromLibrary';
import type { DbSongSnapshot, DiskSongSnapshot } from './diffEngine';

export interface ReconcileProgress {
  phase: 'added' | 'modified' | 'removed';
  completed: number;
  total: number;
  currentPath?: string;
}

export interface ReconcileOptions {
  abortSignal?: AbortSignal;
  onProgress?: (progress: ReconcileProgress) => void;
  batchSize?: number;
}

export interface ReconcileResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ path: string; error: string }>;
}

export class LibraryReconciler {
  /**
   * Reconciles newly added tracks into the library database via bounded concurrency. Assigns the
   * exact resolved folderId to each track.
   */
  async reconcileAdded(
    added: DiskSongSnapshot[],
    options: ReconcileOptions = {}
  ): Promise<ReconcileResult> {
    if (added.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] };
    }

    const { abortSignal, onProgress } = options;
    logger.info(`[LibraryReconciler] Reconciling ${added.length} added tracks...`);

    const mappedSongs = added.map((item) => ({
      songPath: item.path,
      folderId: item.folderId ?? item.rootId
    }));

    const errors: Array<{ path: string; error: string }> = [];

    try {
      await processSongsWithWorkerPool(mappedSongs, abortSignal, (current, total) => {
        if (onProgress) {
          onProgress({
            phase: 'added',
            completed: current,
            total,
            currentPath: mappedSongs[current - 1]?.songPath
          });
        }
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push({ path: 'batch_added', error: msg });
      logger.error('[LibraryReconciler] Error during batch addition', { error });
    }

    return {
      successCount: added.length - errors.length,
      errorCount: errors.length,
      errors
    };
  }

  /**
   * Reconciles modified tracks by re-parsing updated ID3 tags. Explicitly tracks and returns errors
   * if any track fails to re-parse.
   */
  async reconcileModified(
    modified: DiskSongSnapshot[],
    options: ReconcileOptions = {}
  ): Promise<ReconcileResult> {
    if (modified.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] };
    }

    const { abortSignal, onProgress } = options;
    logger.info(`[LibraryReconciler] Reconciling ${modified.length} modified tracks...`);

    const errors: Array<{ path: string; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < modified.length; i++) {
      if (abortSignal?.aborted) break;

      const item = modified[i];
      try {
        const result = await reParseSong(item.path);
        if (result) {
          successCount++;
        } else {
          errors.push({ path: item.path, error: 'reParseSong returned undefined' });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({ path: item.path, error: msg });
        logger.error(`[LibraryReconciler] Failed to re-parse modified track '${item.path}'`, {
          error
        });
      }

      if (onProgress) {
        onProgress({
          phase: 'modified',
          completed: i + 1,
          total: modified.length,
          currentPath: item.path
        });
      }
    }

    return {
      successCount,
      errorCount: errors.length,
      errors
    };
  }

  /** Reconciles removed tracks by unlinking and removing DB records. */
  async reconcileRemoved(
    removed: DbSongSnapshot[],
    options: ReconcileOptions = {}
  ): Promise<ReconcileResult> {
    if (removed.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] };
    }

    const { abortSignal, onProgress, batchSize = 500 } = options;
    logger.info(`[LibraryReconciler] Reconciling ${removed.length} removed tracks...`);

    const paths = removed.map((r) => r.path);
    const errors: Array<{ path: string; error: string }> = [];
    let successCount = 0;

    for (let i = 0; i < paths.length; i += batchSize) {
      if (abortSignal?.aborted) break;

      const chunk = paths.slice(i, i + batchSize);
      try {
        const result = await removeSongsFromLibrary(chunk, abortSignal as AbortSignal);
        if (result?.success) {
          successCount += chunk.length;
        } else {
          errors.push({ path: `chunk_${i}`, error: result?.message ?? 'Failed to remove chunk' });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({ path: `chunk_${i}`, error: msg });
      }

      if (onProgress) {
        onProgress({
          phase: 'removed',
          completed: Math.min(i + chunk.length, paths.length),
          total: paths.length,
          currentPath: chunk[chunk.length - 1]
        });
      }
    }

    return {
      successCount,
      errorCount: errors.length,
      errors
    };
  }
}

export const libraryReconciler = new LibraryReconciler();
export default libraryReconciler;
