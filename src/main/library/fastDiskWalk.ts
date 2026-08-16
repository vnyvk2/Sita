import fs from 'fs/promises';
import path from 'path';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import type { DiskSongSnapshot, ScanRoot } from './diffEngine';
import { resolveOrCreateMusicFolders } from './folderHierarchy';
import { getNormalizedPathKey } from './pathUtils';

export interface DiskWalkOptions {
  abortSignal?: AbortSignal;
  onFileDiscovered?: (totalDiscovered: number, currentPath: string) => void;
  platform?: NodeJS.Platform;
}

export interface DiskWalkResult {
  snapshots: DiskSongSnapshot[];
  failedSubtrees: string[];
}

/**
 * Performs a single-pass asynchronous recursive directory traversal over accessible scan roots.
 * Collects structural file snapshots (path, mtime, size) without reading audio tags, ensures
 * directory hierarchy exists in `music_folders`, and resolves accurate `folderId` per track.
 */
export const fastDiskWalk = async (
  roots: ScanRoot[],
  options: DiskWalkOptions = {}
): Promise<DiskWalkResult> => {
  const { abortSignal, onFileDiscovered, platform = process.platform } = options;
  const rawSnapshots: Array<{
    path: string;
    fileModifiedAt: Date;
    size: number;
    rootId: number;
    dirPath: string;
  }> = [];
  const discoveredDirs = new Set<string>();
  const failedSubtrees: string[] = [];
  const supportedExtSet = new Set(supportedMusicExtensions.map((ext) => ext.toLowerCase()));

  const walkDirectory = async (dirPath: string, rootId: number): Promise<void> => {
    if (abortSignal?.aborted) return;

    discoveredDirs.add(dirPath);

    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      logger.warn(
        `[fastDiskWalk] Failed to read directory '${dirPath}', marking subtree as unscanned.`,
        { error }
      );
      failedSubtrees.push(dirPath);
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
            rawSnapshots.push({
              path: fullPath,
              fileModifiedAt: stat.mtime,
              size: stat.size,
              rootId,
              dirPath
            });

            if (onFileDiscovered) {
              onFileDiscovered(rawSnapshots.length, fullPath);
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

  // Resolve or create music_folders records for all discovered directories
  const folderMapByRoot = new Map<number, Map<string, number>>();
  for (const root of roots) {
    const rootDirs = Array.from(discoveredDirs).filter((d) => d.startsWith(root.path));
    const folderMap = await resolveOrCreateMusicFolders(root.id, root.path, rootDirs, platform);
    folderMapByRoot.set(root.id, folderMap);
  }

  // Assign resolved folderId to each snapshot
  const snapshots: DiskSongSnapshot[] = rawSnapshots.map((item) => {
    const rootFolderMap = folderMapByRoot.get(item.rootId);
    const dirKey = getNormalizedPathKey(item.dirPath, platform);
    const resolvedFolderId = rootFolderMap?.get(dirKey) ?? item.rootId;

    return {
      path: item.path,
      fileModifiedAt: item.fileModifiedAt,
      size: item.size,
      rootId: item.rootId,
      folderId: resolvedFolderId
    };
  });

  return {
    snapshots,
    failedSubtrees
  };
};
