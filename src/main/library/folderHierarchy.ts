import path from 'path';

import { db } from '@main/db/db';
import { musicFolders } from '@main/db/schema';
import { eq, like, or } from 'drizzle-orm';

import logger from '../logger';
import { getNormalizedPathKey, normalizeLibraryPath } from './pathUtils';

export interface FolderNode {
  id: number;
  path: string;
  parentId: number | null;
}

/**
 * Resolves or creates hierarchical `music_folders` records for discovered directories. Ensures that
 * every subdirectory between the scan root and the song's immediate parent directory exists in
 * `music_folders` with the correct `parent_id`, and returns a lookup Map of directory keys to
 * folder IDs.
 *
 * Invariants:
 *
 * - Uses platform-aware path manipulation (path.win32 vs path.posix).
 * - Non-root directories must strictly resolve their immediate parent folder ID; never falls back to
 *   rootId.
 * - Never silently falls back to rootId on insertion failure; throws so the scan reports failure and
 *   preserves dirty state.
 * - Supports responsive cancellation via AbortSignal.
 * - Accepts an injectable database client for testing and controlled composition. Transaction
 *   ownership remains outside the scanner/reconciler API.
 * - Uses the database UNIQUE(path) constraint plus conflict recovery to safely resolve concurrent
 *   folder creation attempts.
 */
export const resolveOrCreateMusicFolders = async (
  rootId: number,
  rootPath: string,
  dirPaths: string[],
  platform: NodeJS.Platform = process.platform,
  database: DB | DBTransaction = db,
  abortSignal?: AbortSignal
): Promise<Map<string, number>> => {
  const folderMap = new Map<string, number>();
  const pathModule = platform === 'win32' ? path.win32 : path.posix;

  const rootPathWithSep = rootPath.endsWith(pathModule.sep) ? rootPath : `${rootPath}${pathModule.sep}`;

  // 1. Selectively fetch existing folders under this root from DB
  const existingFolders = await database
    .select({
      id: musicFolders.id,
      path: musicFolders.path,
      parentId: musicFolders.parentId
    })
    .from(musicFolders)
    .where(
      or(
        eq(musicFolders.path, rootPath),
        like(musicFolders.path, `${rootPathWithSep}%`)
      )
    );

  const existingMap = new Map<string, FolderNode>();
  for (const folder of existingFolders) {
    const key = getNormalizedPathKey(folder.path, platform);
    existingMap.set(key, folder);
    folderMap.set(key, folder.id);
  }

  // Ensure root folder is registered
  const rootKey = getNormalizedPathKey(rootPath, platform);
  folderMap.set(rootKey, rootId);

  // 2. Sort directories by path depth (shallowest first) to ensure parents are created before children
  const uniqueDirs = Array.from(new Set(dirPaths.map((d) => normalizeLibraryPath(d, platform))))
    .filter((d) => getNormalizedPathKey(d, platform) !== rootKey)
    .sort((a, b) => a.length - b.length);

  for (const dir of uniqueDirs) {
    if (abortSignal?.aborted) break;

    const dirKey = getNormalizedPathKey(dir, platform);
    if (folderMap.has(dirKey)) continue;

    // Find parent directory path using platform-specific path methods
    const parentDirPath = normalizeLibraryPath(pathModule.dirname(dir), platform);
    const parentKey = getNormalizedPathKey(parentDirPath, platform);
    const parentId = folderMap.get(parentKey);

    if (parentId === undefined) {
      throw new Error(`Unable to resolve parent folder '${parentDirPath}' for '${dir}'`);
    }

    const folderName = pathModule.basename(dir) || dir;

    // Check if already in DB
    const existing = existingMap.get(dirKey);
    if (existing) {
      folderMap.set(dirKey, existing.id);
    } else {
      let resolvedNode: FolderNode | undefined;

      // Insert new subfolder record into music_folders with race-safe conflict recovery
      const [inserted] = await database
        .insert(musicFolders)
        .values({
          path: dir,
          name: folderName,
          parentId: parentId,
          isBlacklisted: false
        })
        .onConflictDoNothing({ target: musicFolders.path })
        .returning({
          id: musicFolders.id,
          path: musicFolders.path,
          parentId: musicFolders.parentId
        });

      if (inserted) {
        resolvedNode = {
          id: inserted.id,
          path: inserted.path,
          parentId: inserted.parentId
        };
      } else {
        // If onConflictDoNothing prevented insert due to concurrent race, retrieve authoritative DB record
        const [conflictRow] = await database
          .select({
            id: musicFolders.id,
            path: musicFolders.path,
            parentId: musicFolders.parentId
          })
          .from(musicFolders)
          .where(eq(musicFolders.path, dir));

        if (conflictRow) {
          resolvedNode = {
            id: conflictRow.id,
            path: conflictRow.path,
            parentId: conflictRow.parentId
          };
        }
      }

      if (resolvedNode) {
        folderMap.set(dirKey, resolvedNode.id);
        existingMap.set(dirKey, resolvedNode);
        logger.debug(
          `[folderHierarchy] Resolved music_folders record for '${dir}' (id: ${resolvedNode.id}, parentId: ${resolvedNode.parentId})`
        );
      } else {
        throw new Error(`Failed to insert music_folders record for '${dir}'`);
      }
    }
  }

  return folderMap;
};
