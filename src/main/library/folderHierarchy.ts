import path from 'path';

import { db } from '@main/db/db';
import { musicFolders } from '@main/db/schema';

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
 * Invariant: Never silently fall back to rootId on insertion failure; throw so the scan reports
 * failure and preserves dirty state.
 */
export const resolveOrCreateMusicFolders = async (
  rootId: number,
  rootPath: string,
  dirPaths: string[],
  platform: NodeJS.Platform = process.platform,
  trx: DB | DBTransaction = db
): Promise<Map<string, number>> => {
  const folderMap = new Map<string, number>();

  // 1. Fetch all existing folders from DB
  const existingFolders = await trx
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
    const dirKey = getNormalizedPathKey(dir, platform);
    if (folderMap.has(dirKey)) continue;

    // Find parent directory path
    const parentDirPath = normalizeLibraryPath(path.dirname(dir), platform);
    const parentKey = getNormalizedPathKey(parentDirPath, platform);
    const parentId = folderMap.get(parentKey) ?? rootId;

    const folderName = path.basename(dir) || dir;

    // Check if already in DB
    const existing = existingMap.get(dirKey);
    if (existing) {
      folderMap.set(dirKey, existing.id);
    } else {
      // Insert new subfolder record into music_folders
      const [inserted] = await trx
        .insert(musicFolders)
        .values({
          path: dir,
          name: folderName,
          parentId: parentId,
          isBlacklisted: false
        })
        .returning({ id: musicFolders.id });

      if (inserted) {
        folderMap.set(dirKey, inserted.id);
        existingMap.set(dirKey, { id: inserted.id, path: dir, parentId });
        logger.debug(
          `[folderHierarchy] Created music_folders record for '${dir}' (id: ${inserted.id}, parentId: ${parentId})`
        );
      } else {
        throw new Error(`Failed to insert music_folders record for '${dir}'`);
      }
    }
  }

  return folderMap;
};
