import { db } from '@main/db/db';
import { musicFolders } from '@main/db/schema';
import logger from '@main/logger';
import { eq } from 'drizzle-orm';

import { initializePassiveFolderWatchers } from './addWatchersToFolders';
import { initializePassiveParentWatchers } from './addWatchersToParentFolders';

export const initializePassiveWatchers = async (): Promise<void> => {
  try {
    const folders = await db
      .select({ id: musicFolders.id, path: musicFolders.path })
      .from(musicFolders)
      .where(eq(musicFolders.isBlacklisted, false));

    logger.info(`[Watchers] Initializing passive watchers for ${folders.length} known folders.`);

    initializePassiveFolderWatchers(folders);
    initializePassiveParentWatchers(folders.map((f) => f.path));
  } catch (error) {
    logger.error('[Watchers] Failed to initialize passive watchers:', { error });
  }
};

export default initializePassiveWatchers;
