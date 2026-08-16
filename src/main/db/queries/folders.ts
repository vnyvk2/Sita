import { basename } from 'path';

import logger from '@main/logger';
import { eq, inArray, isNull } from 'drizzle-orm';

import { db } from '../db';
import { musicFolders } from '../schema';

export const getAllFolders = async (trx: DB | DBTransaction = db) => {
  return trx.select().from(musicFolders);
};

export const getFolderFromPath = async (path: string, trx: DB | DBTransaction = db) => {
  const data = await trx.select().from(musicFolders).where(eq(musicFolders.path, path));

  return data.at(0);
};

export const getFolderStructure = async (
  parentId: number | null = null,
  trx: DB | DBTransaction = db
): Promise<FolderStructure[]> => {
  // Fetch folders with the given parentId
  const folders = await trx
    .select()
    .from(musicFolders)
    .where(parentId === null ? isNull(musicFolders.parentId) : eq(musicFolders.parentId, parentId));

  const result: FolderStructure[] = [];

  for (const folder of folders) {
    const subFolders = await getFolderStructure(folder.id, trx);

    result.push({
      path: folder.path,
      stats: {
        lastModifiedDate: folder.lastModifiedAt!,
        lastChangedDate: folder.lastChangedAt!,
        fileCreatedDate: folder.folderCreatedAt!,
        lastParsedDate: folder.lastParsedAt!
      },
      subFolders
    });
  }

  return result;
};

export const getAllFolderStructures = async (
  trx: DB | DBTransaction = db
): Promise<FolderStructure[]> => {
  const rootFolders = await trx.select().from(musicFolders).where(isNull(musicFolders.parentId));

  const structures = await Promise.all(
    rootFolders.map(async (folder) => ({
      path: folder.path,
      stats: {
        lastModifiedDate: folder.lastModifiedAt!,
        lastChangedDate: folder.lastChangedAt!,
        fileCreatedDate: folder.folderCreatedAt!,
        lastParsedDate: folder.lastParsedAt!
      },
      subFolders: await getFolderStructure(folder.id, trx)
    }))
  );

  return structures;
};

export const saveAllFolderStructures = async (
  structures: FolderStructure[],
  trx: DBTransaction
) => {
  const addedFolders: (typeof musicFolders.$inferSelect)[] = [];
  const updatedFolders: (typeof musicFolders.$inferSelect)[] = [];

  for (const structure of structures) {
    const result = await createOrUpdateFolderStructure(structure, trx, undefined);

    addedFolders.push(...result.addedFolders);
    updatedFolders.push(...result.updatedFolders);
  }

  return { addedFolders, updatedFolders };
};

const createOrUpdateFolderStructure = async (
  structure: FolderStructure,
  trx: DBTransaction,
  parentId?: number
) => {
  const addedFolders: (typeof musicFolders.$inferSelect)[] = [];
  const updatedFolders: (typeof musicFolders.$inferSelect)[] = [];

  const currentFolderData = {
    name: basename(structure.path),
    path: structure.path,
    lastModifiedAt: structure.stats.lastModifiedDate,
    lastChangedAt: structure.stats.lastChangedDate,
    folderCreatedAt: structure.stats.fileCreatedDate,
    lastParsedAt: structure.stats.lastParsedDate,
    parentId
  };

  const folder = await trx
    .select()
    .from(musicFolders)
    .where(eq(musicFolders.path, structure.path))
    .limit(1);
  const selectedFolder = folder.at(0);

  if (selectedFolder) {
    const data = await trx
      .update(musicFolders)
      .set(currentFolderData)
      .where(eq(musicFolders.id, selectedFolder.id))
      .returning();

    updatedFolders.push(data[0]);
  } else {
    const addedFolder = await trx.insert(musicFolders).values(currentFolderData).returning();

    addedFolders.push(addedFolder[0]);
  }

  if (structure.subFolders.length > 0) {
    for (const subFolder of structure.subFolders) {
      const parentFolderId = selectedFolder ? selectedFolder.id : addedFolders[0].id;
      const res = await createOrUpdateFolderStructure(subFolder, trx, parentFolderId);

      addedFolders.push(...res.addedFolders);
      updatedFolders.push(...res.updatedFolders);
    }
  }

  return { addedFolders, updatedFolders };
};

export const getAllMusicFolders = async (trx: DB | DBTransaction = db): Promise<MusicFolder[]> => {
  const allFolders = await trx.query.musicFolders.findMany({
    columns: {
      id: true,
      path: true,
      parentId: true,
      isBlacklisted: true,
      lastModifiedAt: true,
      lastChangedAt: true,
      folderCreatedAt: true,
      lastParsedAt: true
    },
    with: {
      songs: {
        columns: { id: true }
      }
    }
  });

  if (allFolders.length === 0) return [];

  const folderMap = new Map<number, MusicFolder & { id: number; parentId: number | null }>();
  const rootFolders: MusicFolder[] = [];

  for (let i = 0; i < allFolders.length; i++) {
    const f = allFolders[i];
    folderMap.set(f.id, {
      id: f.id,
      parentId: f.parentId,
      path: f.path,
      stats: {
        lastModifiedDate: f.lastModifiedAt!,
        lastChangedDate: f.lastChangedAt!,
        fileCreatedDate: f.folderCreatedAt!,
        lastParsedDate: f.lastParsedAt!
      },
      songIds: f.songs.map((s) => s.id),
      isBlacklisted: f.isBlacklisted,
      subFolders: []
    });
  }

  for (const folder of folderMap.values()) {
    if (folder.parentId === null) {
      rootFolders.push(folder);
    } else {
      const parent = folderMap.get(folder.parentId);
      if (!parent) {
        logger.error(
          `Unable to resolve parent folder ID ${folder.parentId} for folder '${folder.path}' (ID: ${folder.id})`,
          { folderId: folder.id, parentId: folder.parentId, folderPath: folder.path }
        );
        throw new Error(
          `Unable to resolve parent folder ID ${folder.parentId} for '${folder.path}'`
        );
      }
      parent.subFolders.push(folder);
    }
  }

  // Verify tree reachability (prevents circular parent cycles from silently dropping nodes)
  let reachableCount = 0;
  const countReachable = (nodes: MusicFolder[]) => {
    for (const node of nodes) {
      reachableCount++;
      if (node.subFolders.length > 0) {
        countReachable(node.subFolders);
      }
    }
  };
  countReachable(rootFolders);

  if (reachableCount < folderMap.size) {
    logger.error(
      `Circular parent-child cycle detected in music folders: ${folderMap.size - reachableCount} folder(s) are unreachable from root.`
    );
    throw new Error(
      `Circular parent-child cycle detected in music folders: ${folderMap.size - reachableCount} folder(s) unreachable from root.`
    );
  }

  return rootFolders;
};

export const getFoldersByIds = async (ids: number[], trx: DB | DBTransaction = db) => {
  const folders = await trx.query.musicFolders.findMany({
    where: (f) => inArray(f.id, ids)
  });

  return folders;
};

export const getFoldersByPaths = async (paths: string[], trx: DB | DBTransaction = db) => {
  const folders = await trx.query.musicFolders.findMany({
    where: (f) => inArray(f.path, paths)
  });

  return folders;
};

export const getBlacklistedFolders = async () => {
  const data = await db.query.musicFolders.findMany({
    where: (f) => eq(f.isBlacklisted, true)
  });

  return data;
};

export const isFolderBlacklisted = async (folderId: number) => {
  const data = await db.query.musicFolders.findFirst({
    where: eq(musicFolders.id, folderId)
  });
  return !!data;
};

export const addFoldersToBlacklist = async (folderIds: number[]) => {
  await db
    .update(musicFolders)
    .set({ isBlacklisted: true, isBlacklistedUpdatedAt: new Date() })
    .where(inArray(musicFolders.id, folderIds));
};

export const deleteFolders = async (folderIds: number[], trx: DB | DBTransaction = db) => {
  if (folderIds.length === 0) return;
  await trx.delete(musicFolders).where(inArray(musicFolders.id, folderIds));
};

export const getBlacklistedFolderPaths = async () => {
  const data = await db.query.musicFolders.findMany({
    columns: { path: true },
    where: (f) => eq(f.isBlacklisted, true)
  });
  return data.map((folder) => folder.path);
};

export const removeFoldersFromBlacklist = async (folderIds: number[]) => {
  await db
    .update(musicFolders)
    .set({ isBlacklisted: false, isBlacklistedUpdatedAt: new Date() })
    .where(inArray(musicFolders.id, folderIds));
};
