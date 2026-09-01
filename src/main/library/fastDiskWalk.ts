import fs from 'fs/promises';
import path from 'path';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import type { DiskSongSnapshot, ScanRoot } from './diffEngine';

export interface DiskWalkOptions {
  abortSignal?: AbortSignal;
  onFileDiscovered?: (totalDiscovered: number, currentPath: string) => void;
  maxConcurrency?: number;
}

export interface DiskWalkResult {
  snapshots: DiskSongSnapshot[];
  failedSubtrees: string[];
  failedPaths: string[];
  cancelled?: boolean;
  executionMode?: 'worker' | 'local_fallback' | 'local_direct';
  workerPid?: number;
  durationMs?: number;
}

/**
 * Local in-process directory traversal. Used in Vitest unit test suites or as an emergency fallback
 * if the utilityProcess is unavailable.
 */
export const fastDiskWalkLocal = async (
  roots: ScanRoot[],
  options: DiskWalkOptions = {}
): Promise<DiskWalkResult> => {
  const { abortSignal, onFileDiscovered, maxConcurrency = 8 } = options;
  const snapshots: DiskSongSnapshot[] = [];
  const failedSubtrees: string[] = [];
  const failedPaths: string[] = [];
  const supportedExtSet = new Set(supportedMusicExtensions.map((ext) => ext.toLowerCase()));

  const queue: Array<{ dirPath: string; rootId: number }> = roots.map((r) => ({
    dirPath: r.path,
    rootId: r.id
  }));

  let activeWorkers = 0;
  let hasAborted = false;
  const waiters: Array<() => void> = [];

  const notifyWaiters = () => {
    while (waiters.length > 0) {
      const resolve = waiters.shift();
      if (resolve) resolve();
    }
  };

  const worker = async () => {
    while (true) {
      if (hasAborted || abortSignal?.aborted) {
        hasAborted = true;
        notifyWaiters();
        break;
      }

      if (queue.length === 0) {
        if (activeWorkers === 0) {
          notifyWaiters();
          break;
        }

        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
        continue;
      }

      const item = queue.shift()!;
      activeWorkers++;

      try {
        let entries: import('fs').Dirent[];
        try {
          entries = await fs.readdir(item.dirPath, { withFileTypes: true });
        } catch (error) {
          logger.warn(
            `[fastDiskWalk] Failed to read directory '${item.dirPath}', marking subtree as unscanned.`,
            { error }
          );
          failedSubtrees.push(item.dirPath);
          continue;
        }

        for (const entry of entries) {
          if (abortSignal?.aborted || hasAborted) break;

          if (entry.name.startsWith('.')) continue;

          const fullPath = path.join(item.dirPath, entry.name);

          if (entry.isDirectory()) {
            queue.push({ dirPath: fullPath, rootId: item.rootId });
            notifyWaiters();
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExtSet.has(ext)) {
              try {
                const stat = await fs.stat(fullPath);
                snapshots.push({
                  path: fullPath,
                  fileModifiedAt: stat.mtime,
                  size: stat.size,
                  rootId: item.rootId,
                  dirPath: item.dirPath
                });

                if (onFileDiscovered) {
                  onFileDiscovered(snapshots.length, fullPath);
                }
              } catch (statError) {
                logger.warn(
                  `[fastDiskWalk] Failed to stat file '${fullPath}', marking path as unverified.`,
                  { error: statError }
                );
                failedPaths.push(fullPath);
              }
            }
          }
        }
      } finally {
        activeWorkers--;
        notifyWaiters();
      }
    }
  };

  const poolSize = Math.max(1, maxConcurrency);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < poolSize; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (hasAborted || abortSignal?.aborted) {
    return {
      snapshots: [],
      failedSubtrees: [],
      failedPaths: [],
      cancelled: true,
      executionMode: 'local_direct'
    };
  }

  return {
    snapshots,
    failedSubtrees,
    failedPaths,
    cancelled: false,
    executionMode: 'local_direct'
  };
};

/**
 * Performs a 100% read-only, bounded-concurrency asynchronous directory traversal over accessible
 * scan roots.
 *
 * In Electron runtime (Phase C2), delegates directory traversal to the utilityProcess media worker
 * via MediaWorkerBridge, keeping all fs.readdir and fs.stat operations off the Main process event
 * loop. In Vitest or non-Electron environments, transparently falls back to fastDiskWalkLocal.
 */
export const fastDiskWalk = async (
  roots: ScanRoot[],
  options: DiskWalkOptions = {}
): Promise<DiskWalkResult> => {
  const startTime = Date.now();

  if (typeof process !== 'undefined' && process.versions?.electron && !process.env.VITEST) {
    try {
      const { mediaWorkerBridge } = await import('../workers/process/MediaWorkerBridge');
      const bridgeResult = await mediaWorkerBridge.walkDirectory(roots, {
        abortSignal: options.abortSignal,
        onFileDiscovered: options.onFileDiscovered,
        maxConcurrency: options.maxConcurrency,
        supportedExtensions: supportedMusicExtensions
      });

      const durationMs = Date.now() - startTime;
      const workerPid = mediaWorkerBridge.getWorkerPid();

      logger.info(
        `[fastDiskWalk] Discovered ${bridgeResult.snapshots.length} files via utilityProcess worker (pid: ${workerPid ?? 'unknown'}) in ${durationMs}ms (cancelled: ${Boolean(bridgeResult.cancelled)}).`,
        {
          executionMode: 'worker',
          workerPid,
          durationMs,
          filesDiscovered: bridgeResult.snapshots.length,
          cancelled: bridgeResult.cancelled
        }
      );

      try {
        performance.mark('fastDiskWalk:executionMode:worker');
      } catch {
        // Ignore performance mark failures in environments without performance API
      }

      return {
        ...bridgeResult,
        executionMode: 'worker',
        workerPid,
        durationMs
      };
    } catch (workerError) {
      const fallbackDurationMs = Date.now() - startTime;
      logger.warn(
        `[fastDiskWalk] Worker directory walk failed (${fallbackDurationMs}ms), falling back to local walk in Main.`,
        { error: workerError }
      );

      try {
        performance.mark('fastDiskWalk:executionMode:local_fallback');
      } catch {
        // Ignore
      }

      const localResult = await fastDiskWalkLocal(roots, options);
      return {
        ...localResult,
        executionMode: 'local_fallback',
        durationMs: Date.now() - startTime
      };
    }
  }

  try {
    performance.mark('fastDiskWalk:executionMode:local_direct');
  } catch {
    // Ignore
  }

  const localResult = await fastDiskWalkLocal(roots, options);
  return {
    ...localResult,
    executionMode: 'local_direct',
    durationMs: Date.now() - startTime
  };
};
