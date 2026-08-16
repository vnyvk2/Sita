import fs from 'fs/promises';
import path from 'path';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import type { DiskSongSnapshot, ScanRoot } from './diffEngine';

export interface DiskWalkOptions {
  abortSignal?: AbortSignal;
  onFileDiscovered?: (totalDiscovered: number, currentPath: string) => void;
}

/**
 * Performs a single-pass asynchronous recursive directory traversal over accessible scan roots.
 * Collects structural file snapshots (path, mtime, size) without reading audio tags.
 */
export const fastDiskWalk = async (
  roots: ScanRoot[],
  options: DiskWalkOptions = {}
): Promise<DiskSongSnapshot[]> => {
  const { abortSignal, onFileDiscovered } = options;
  const snapshots: DiskSongSnapshot[] = [];
  const supportedExtSet = new Set(supportedMusicExtensions.map((ext) => ext.toLowerCase()));

  const walkDirectory = async (dirPath: string, rootId: number): Promise<void> => {
    if (abortSignal?.aborted) return;

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(`[fastDiskWalk] Failed to read directory '${dirPath}', skipping.`, { error });
      return;
    }

    const subDirs: string[] = [];

    for (const entry of entries) {
      if (abortSignal?.aborted) return;

      // Skip hidden directories/files (e.g. .git, .DS_Store)
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        subDirs.push(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (supportedExtSet.has(ext)) {
          try {
            const stat = await fs.stat(fullPath);
            snapshots.push({
              path: fullPath,
              fileModifiedAt: stat.mtime,
              size: stat.size,
              rootId
            });

            if (onFileDiscovered) {
              onFileDiscovered(snapshots.length, fullPath);
            }
          } catch (statError) {
            logger.warn(`[fastDiskWalk] Failed to stat file '${fullPath}'`, { error: statError });
          }
        }
      }
    }

    for (const subDir of subDirs) {
      if (abortSignal?.aborted) return;
      await walkDirectory(subDir, rootId);
    }
  };

  for (const root of roots) {
    if (abortSignal?.aborted) break;
    await walkDirectory(root.path, root.id);
  }

  return snapshots;
};
