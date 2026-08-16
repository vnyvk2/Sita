import { db } from '@main/db/db';
import { musicFolders } from '@main/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

import type { ScanRoot } from './diffEngine';

/** Retrieves all configured, non-blacklisted top-level library scan roots from the database. */
export const getLibraryScanRoots = async (trx: DB | DBTransaction = db): Promise<ScanRoot[]> => {
  const roots = await trx
    .select({
      id: musicFolders.id,
      path: musicFolders.path
    })
    .from(musicFolders)
    .where(and(isNull(musicFolders.parentId), eq(musicFolders.isBlacklisted, false)));

  return roots;
};
