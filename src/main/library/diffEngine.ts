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
  dirPath?: string;
  folderId?: number;
}

export interface DbSongSnapshot {
  id: number;
  path: string;
  fileModifiedAt: Date;
  folderId: number | null;
  isBlacklisted?: boolean;
}

export interface DiffOptions {
  skippedRoots?: ScanRoot[];
  failedSubtrees?: string[];
  failedPaths?: string[];
  toleranceMs?: number;
  platform?: NodeJS.Platform;
  /**
   * Defense-in-depth: When true, the walk result is NOT authoritative. The diff engine will produce
   * zero removals regardless of snapshot content. This prevents a failed/incomplete walk from
   * triggering mass deletion.
   */
  walkFailed?: boolean;
}

export interface DiffResult {
  added: DiskSongSnapshot[];
  modified: DiskSongSnapshot[];
  removed: DbSongSnapshot[];
  unchangedCount: number;
  skippedRoots: ScanRoot[];
  failedSubtrees: string[];
  failedPaths: string[];
}

/**
 * Pure in-memory diff engine. Computes Added, Modified, Removed, and Unchanged sets with
 * root-scoped safety, failed-subtree protection, and failed-stat path safety.
 *
 * Invariants:
 *
 * - Discovery & diffing are 100% side-effect free.
 * - $|disk - db| \le toleranceMs \implies unchanged$
 * - $disk > db + toleranceMs \implies modified$
 * - $disk < db - toleranceMs \implies unchanged$
 * - Blacklisted DB songs participate in path matching but are excluded from Added/Modified/Removed
 *   reconciliation.
 * - Songs belonging to skipped/disconnected roots are strictly excluded from the `removed` set.
 * - Songs belonging to failed/unscanned subtrees or failed-stat paths are strictly excluded from the
 *   `removed` set.
 */
export const diffFilesystemSnapshot = (
  disk: DiskSongSnapshot[],
  dbSongs: DbSongSnapshot[],
  accessibleRoots: ScanRoot[],
  options: DiffOptions = {}
): DiffResult => {
  const {
    skippedRoots = [],
    failedSubtrees = [],
    failedPaths = [],
    toleranceMs = 1000,
    platform = process.platform,
    walkFailed = false
  } = options;

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

  const failedPathKeySet = new Set(failedPaths.map((p) => getNormalizedPathKey(p, platform)));

  const added: DiskSongSnapshot[] = [];
  const modified: DiskSongSnapshot[] = [];
  let unchangedCount = 0;

  // 1. Identify Added and Modified tracks from disk snapshot
  for (const diskItem of disk) {
    const key = getNormalizedPathKey(diskItem.path, platform);
    const dbItem = dbMap.get(key);

    if (!dbItem) {
      added.push(diskItem);
    } else if (dbItem.isBlacklisted) {
      // Existing blacklisted track: recognized on disk, bypass reconciliation
      unchangedCount++;
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

  // 2. Identify Removed tracks (Root-Scoped & Unverified-Filesystem Protected Boundary)
  const removed: DbSongSnapshot[] = [];

  // Defense-in-depth: If the walk failed, the disk snapshot is NOT authoritative.
  // No songs may be removed based on a non-authoritative snapshot.
  if (walkFailed) {
    return {
      added,
      modified,
      removed,
      unchangedCount,
      skippedRoots,
      failedSubtrees,
      failedPaths
    };
  }

  for (const dbItem of dbSongs) {
    if (dbItem.isBlacklisted) {
      continue;
    }

    const key = getNormalizedPathKey(dbItem.path, platform);

    // If song is present on disk, it is not removed
    if (diskMap.has(key)) {
      continue;
    }

    // Safety check 1: Individual file stat failure protection
    if (failedPathKeySet.has(key)) {
      continue;
    }

    // Safety check 2: Disconnected root protection
    const isUnderSkippedRoot = skippedRoots.some((skippedRoot) =>
      isPathInsideRoot(dbItem.path, skippedRoot.path, platform)
    );
    if (isUnderSkippedRoot) {
      continue;
    }

    // Safety check 3: Failed/un-scanned directory subtree protection
    const isUnderFailedSubtree = failedSubtrees.some((failedDir) =>
      isPathInsideRoot(dbItem.path, failedDir, platform)
    );
    if (isUnderFailedSubtree) {
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
    skippedRoots,
    failedSubtrees,
    failedPaths
  };
};
