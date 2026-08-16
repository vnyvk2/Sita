import path from 'path';

import { db } from '@main/db/db';
import { musicFolders } from '@main/db/schema';
import { eq } from 'drizzle-orm';

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
 * - Employs onConflictDoNothing with fallback retrieval for 100% race-condition immunity under
 *   concurrent execution.
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

  // 1. Fetch all existing folders from DB
  const existingFolders = await database
    .select({
      id: musicFolders.id,
      path: musicFolders.path,
      parentId: musicFolders.parentId
    })
    .from(musicFolders);

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
      let folderIdToUse: number | undefined;

      // Insert new subfolder record into music_folders with race-condition immunity
      const [inserted] = await database
        .insert(musicFolders)
        .values({
          path: dir,
          name: folderName,
          parentId: parentId,
          isBlacklisted: false
        })
        .onConflictDoNothing({ target: musicFolders.path })
        .returning({ id: musicFolders.id });

      if (inserted) {
        folderIdToUse = inserted.id;
      } else {
        // If onConflictDoNothing prevented insert due to concurrent race, retrieve existing record
        const [conflictRow] = await database
          .select({ id: musicFolders.id })
          .from(musicFolders)
          .where(eq(musicFolders.path, dir));

        folderIdToUse = conflictRow?.id;
      }

      if (folderIdToUse !== undefined) {
        folderMap.set(dirKey, folderIdToUse);
        existingMap.set(dirKey, { id: folderIdToUse, path: dir, parentId });
        logger.debug(
          `[folderHierarchy] Resolved music_folders record for '${dir}' (id: ${folderIdToUse}, parentId: ${parentId})`
        );
      } else {
        throw new Error(`Failed to insert music_folders record for '${dir}'`);
      }
    }
  }

  return folderMap;
};
