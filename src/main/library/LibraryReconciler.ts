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

export class LibraryReconciler {
  /** Reconciles newly added tracks into the library database via bounded concurrency. */
  async reconcileAdded(added: DiskSongSnapshot[], options: ReconcileOptions = {}): Promise<void> {
    if (added.length === 0) return;

    const { abortSignal, onProgress } = options;
    logger.info(`[LibraryReconciler] Reconciling ${added.length} added tracks...`);

    const mappedSongs = added.map((item) => ({
      songPath: item.path,
      folderId: item.rootId
    }));

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
  }

  /** Reconciles modified tracks by re-parsing updated ID3 tags. */
  async reconcileModified(
    modified: DiskSongSnapshot[],
    options: ReconcileOptions = {}
  ): Promise<void> {
    if (modified.length === 0) return;

    const { abortSignal, onProgress } = options;
    logger.info(`[LibraryReconciler] Reconciling ${modified.length} modified tracks...`);

    for (let i = 0; i < modified.length; i++) {
      if (abortSignal?.aborted) break;

      const item = modified[i];
      try {
        await reParseSong(item.path);
      } catch (error) {
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
  }

  /** Reconciles removed tracks by unlinking and removing DB records in chunked batches (N = 500). */
  async reconcileRemoved(removed: DbSongSnapshot[], options: ReconcileOptions = {}): Promise<void> {
    if (removed.length === 0) return;

    const { abortSignal, onProgress, batchSize = 500 } = options;
    logger.info(`[LibraryReconciler] Reconciling ${removed.length} removed tracks...`);

    const paths = removed.map((r) => r.path);

    for (let i = 0; i < paths.length; i += batchSize) {
      if (abortSignal?.aborted) break;

      const chunk = paths.slice(i, i + batchSize);
      await removeSongsFromLibrary(chunk, abortSignal as AbortSignal);

      if (onProgress) {
        onProgress({
          phase: 'removed',
          completed: Math.min(i + chunk.length, paths.length),
          total: paths.length,
          currentPath: chunk[chunk.length - 1]
        });
      }
    }
  }
}

export const libraryReconciler = new LibraryReconciler();
export default libraryReconciler;
