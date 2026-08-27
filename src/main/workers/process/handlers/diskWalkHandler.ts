import fs from 'fs/promises';
import path from 'path';

export interface DiskWalkRoot {
  id: number;
  path: string;
}

export interface DiskSongSnapshotDTO {
  path: string;
  fileModifiedAt: Date;
  size: number;
  rootId: number;
  dirPath?: string;
}

export interface DiskWalkHandlerOptions {
  supportedExtensions: string[];
  abortSignal?: AbortSignal;
  onProgress?: (totalDiscovered: number, currentPath?: string) => void;
  maxConcurrency?: number;
}

export interface DiskWalkHandlerResult {
  snapshots: DiskSongSnapshotDTO[];
  failedSubtrees: string[];
  failedPaths: string[];
}

/**
 * Worker-side asynchronous directory walker.
 * Runs inside the Electron utilityProcess.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Zero database dependencies, zero ORM imports.
 * 2. 100% read-only filesystem operations.
 * 3. Does NOT read ID3 tags (only directory entries and stat metadata).
 * 4. Error isolation: records failedSubtrees and failedPaths without throwing,
 *    preventing false deletion cascades in the Main diffEngine.
 */
export async function executeDiskWalk(
  roots: DiskWalkRoot[],
  options: DiskWalkHandlerOptions
): Promise<DiskWalkHandlerResult> {
  const { supportedExtensions, abortSignal, onProgress, maxConcurrency = 8 } = options;

  const snapshots: DiskSongSnapshotDTO[] = [];
  const failedSubtrees: string[] = [];
  const failedPaths: string[] = [];
  const supportedExtSet = new Set(supportedExtensions.map((ext) => ext.toLowerCase()));

  const queue: Array<{ dirPath: string; rootId: number }> = roots.map((r) => ({
    dirPath: r.path,
    rootId: r.id
  }));

  let activeWorkers = 0;
  let hasAborted = false;
  const waiters: Array<() => void> = [];

  // Throttle progress updates to avoid IPC message channel flooding
  let lastProgressReportTime = 0;
  let lastReportedCount = 0;

  const maybeEmitProgress = (count: number, currentPath?: string, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (force || count - lastReportedCount >= 100 || now - lastProgressReportTime >= 100) {
      lastProgressReportTime = now;
      lastReportedCount = count;
      onProgress(count, currentPath);
    }
  };

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
          failedSubtrees.push(item.dirPath);
          continue;
        }

        for (const entry of entries) {
          if (abortSignal?.aborted || hasAborted) break;

          // Skip hidden directories/files (.git, .DS_Store, etc.)
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

                maybeEmitProgress(snapshots.length, fullPath);
              } catch {
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

  // Emit final progress update
  maybeEmitProgress(snapshots.length, undefined, true);

  return {
    snapshots,
    failedSubtrees,
    failedPaths
  };
}
