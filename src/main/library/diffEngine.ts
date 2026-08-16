import { getNormalizedPathKey, isPathInsideRoot } from './pathUtils';

export interface ScanRoot {
  id: number;
  path: string;
}

export interface DiskSongSnapshot {
  path: string;
  fileModifiedAt: Date;
  size?: number;
  rootId: number;
}

export interface DbSongSnapshot {
  id: number;
  path: string;
  fileModifiedAt: Date;
  size?: number | null;
  folderId: number | null;
}

export interface DiffResult {
  added: DiskSongSnapshot[];
  modified: DiskSongSnapshot[];
  removed: DbSongSnapshot[];
  unchangedCount: number;
  skippedRoots: ScanRoot[];
}

/**
 * Pure in-memory diff engine. Computes Added, Modified, Removed, and Unchanged sets with
 * root-scoped safety and timestamp tolerance.
 *
 * Invariants:
 *
 * - $|disk - db| \le toleranceMs \implies unchanged$
 * - $disk > db + toleranceMs \implies modified$
 * - $disk < db - toleranceMs \implies unchanged$
 * - Songs belonging to skipped/disconnected roots are strictly excluded from the `removed` set.
 */
export const diffFilesystemSnapshot = (
  disk: DiskSongSnapshot[],
  dbSongs: DbSongSnapshot[],
  accessibleRoots: ScanRoot[],
  skippedRoots: ScanRoot[] = [],
  toleranceMs = 1000,
  platform: NodeJS.Platform = process.platform
): DiffResult => {
  const diskMap = new Map<string, DiskSongSnapshot>();
  for (const item of disk) {
    const key = getNormalizedPathKey(item.path, platform);
    diskMap.set(key, item);
  }

  const dbMap = new Map<string, DbSongSnapshot>();
  for (const item of dbSongs) {
    const key = getNormalizedPathKey(item.path, platform);
    dbMap.set(key, item);
  }

  const added: DiskSongSnapshot[] = [];
  const modified: DiskSongSnapshot[] = [];
  let unchangedCount = 0;

  // 1. Identify Added and Modified tracks from disk snapshot
  for (const diskItem of disk) {
    const key = getNormalizedPathKey(diskItem.path, platform);
    const dbItem = dbMap.get(key);

    if (!dbItem) {
      added.push(diskItem);
    } else {
      const diskTime = diskItem.fileModifiedAt.getTime();
      const dbTime = dbItem.fileModifiedAt.getTime();
      const diff = diskTime - dbTime;

      if (diff > toleranceMs) {
        modified.push(diskItem);
      } else {
        unchangedCount++;
      }
    }
  }

  // 2. Identify Removed tracks (Root-Scoped Safety Boundary)
  const removed: DbSongSnapshot[] = [];

  for (const dbItem of dbSongs) {
    const key = getNormalizedPathKey(dbItem.path, platform);

    // If song is present on disk, it is not removed
    if (diskMap.has(key)) {
      continue;
    }

    // Check if the DB song belongs to a skipped/disconnected root
    const isUnderSkippedRoot = skippedRoots.some((skippedRoot) =>
      isPathInsideRoot(dbItem.path, skippedRoot.path, platform)
    );

    if (isUnderSkippedRoot) {
      // Disconnected drive protection: preserve DB song records
      continue;
    }

    // Check if the DB song belongs to an accessible root
    const isUnderAccessibleRoot = accessibleRoots.some((accessibleRoot) =>
      isPathInsideRoot(dbItem.path, accessibleRoot.path, platform)
    );

    if (isUnderAccessibleRoot) {
      removed.push(dbItem);
    }
  }

  return {
    added,
    modified,
    removed,
    unchangedCount,
    skippedRoots
  };
};
