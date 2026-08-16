import path from 'path';

import { db } from '@main/db/db';

import { processSongsWithWorkerPool } from '../core/songWorkerPool';
import logger from '../logger';
import reParseSong from '../parseSong/reParseSong';
import removeSongsFromLibrary from '../removeSongsFromLibrary';
import type { DbSongSnapshot, DiskSongSnapshot, ScanRoot } from './diffEngine';
import { resolveOrCreateMusicFolders } from './folderHierarchy';
import { getNormalizedPathKey, isPathInsideRoot, normalizeLibraryPath } from './pathUtils';

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
  platform?: NodeJS.Platform;
}

export interface ReconcileResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ path: string; error: string }>;
  cancelled?: boolean;
}

export class LibraryReconciler {
  /**
   * Reconciles newly added tracks into the library database via bounded concurrency.
   * Resolves/creates required `music_folders` hierarchy before ingesting songs, assigning accurate
   * immediate folder IDs to each track.
   *
   * Invariants:
   *
   * - Platform-aware path calculations (path.win32 vs path.posix).
   * - Never falls back to rootId if a folder ID cannot be resolved; records an explicit error.
   * - Every failed track is accounted for in errorCount, guaranteeing exact track accounting.
   * - Sets cancelled: true when abortSignal is triggered.
   */
  async reconcileAdded(
    added: DiskSongSnapshot[],
    accessibleRoots: ScanRoot[],
    options: ReconcileOptions = {}
  ): Promise<ReconcileResult> {
    if (added.length === 0) {
      return { successCount: 0, errorCount: 0, errors: [] };
    }

    const { abortSignal, onProgress, platform = process.platform } = options;
    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    logger.info(`[LibraryReconciler] Reconciling ${added.length} added tracks...`);

    const errors: Array<{ path: string; error: string }> = [];
    const eligibleSongs: Array<{ songPath: string; folderId: number }> = [];

    // 1. Resolve and create missing music_folders for all added tracks
    for (const root of accessibleRoots) {
      if (abortSignal?.aborted) {
        return {
          successCount: 0,
          errorCount: errors.length,
          errors,
          cancelled: true
        };
      }

      const songsInRoot = added.filter(
        (s) => s.rootId === root.id || isPathInsideRoot(s.path, root.path, platform)
      );
      if (songsInRoot.length === 0) continue;

      const uniqueDirs = Array.from(
        new Set(
          songsInRoot.map((s) =>
            normalizeLibraryPath(s.dirPath ?? pathModule.dirname(s.path), platform)
          )
        )
      );

      try {
        const folderMap = await resolveOrCreateMusicFolders(
          root.id,
          root.path,
          uniqueDirs,
          platform,
          db,
          abortSignal
        );

        if (abortSignal?.aborted) {
          return {
            successCount: 0,
            errorCount: errors.length,
            errors,
            cancelled: true
          };
        }

        for (const song of songsInRoot) {
          const dir = normalizeLibraryPath(song.dirPath ?? pathModule.dirname(song.path), platform);
          const dirKey = getNormalizedPathKey(dir, platform);
          const folderId = folderMap.get(dirKey);

          if (folderId === undefined) {
            errors.push({
              path: song.path,
              error: `Unable to resolve folder ID for directory '${dir}'`
            });
            continue;
          }

          eligibleSongs.push({
            songPath: song.path,
            folderId
          });
        }
      } catch (folderError) {
        const msg = folderError instanceof Error ? folderError.message : String(folderError);
        logger.error(
          `[LibraryReconciler] Folder hierarchy creation failed for root '${root.path}'`,
          {
            error: folderError
          }
        );
        for (const song of songsInRoot) {
          errors.push({ path: song.path, error: msg });
        }
      }
    }

    if (abortSignal?.aborted) {
      return {
        successCount: 0,
        errorCount: errors.length,
        errors,
        cancelled: true
      };
    }

    if (eligibleSongs.length === 0) {
      return {
        successCount: 0,
        errorCount: errors.length,
        errors
      };
    }

    // 2. Ingest songs with bounded concurrency worker pool
    const poolResult = await processSongsWithWorkerPool(
      eligibleSongs,
      abortSignal,
      (current, total) => {
        if (onProgress) {
          onProgress({
            phase: 'added',
            completed: current,
            total,
            currentPath: eligibleSongs[current - 1]?.songPath
          });
        }
      }
    );

    return {
      successCount: poolResult.successCount,
      errorCount: errors.length + poolResult.errorCount,
      errors: [...errors, ...poolResult.errors],
      cancelled: abortSignal?.aborted
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
      if (abortSignal?.aborted) {
        return {
          successCount,
          errorCount: errors.length,
          errors,
          cancelled: true
        };
      }

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
      errors,
      cancelled: abortSignal?.aborted
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
      if (abortSignal?.aborted) {
        return {
          successCount,
          errorCount: errors.length,
          errors,
          cancelled: true
        };
      }

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
      errors,
      cancelled: abortSignal?.aborted
    };
  }
}

export const libraryReconciler = new LibraryReconciler();
export default libraryReconciler;
