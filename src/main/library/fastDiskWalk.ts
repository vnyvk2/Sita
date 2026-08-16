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
}

/**
 * Performs a 100% read-only, bounded-concurrency asynchronous directory traversal over accessible
 * scan roots. Collects structural file snapshots (path, mtime, size) without reading audio tags or
 * mutating the database. Protects against false deletions by recording failedSubtrees and
 * failedPaths on I/O errors.
 */
export const fastDiskWalk = async (
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
          // All directories processed
          notifyWaiters();
          break;
        }

        // Wait for active workers to push subdirectories or finish
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

          // Skip hidden directories/files (e.g. .git, .DS_Store)
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

  return {
    snapshots,
    failedSubtrees,
    failedPaths
  };
};
