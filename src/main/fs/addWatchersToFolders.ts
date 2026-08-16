import fsSync, { type WatchEventType } from 'fs';

import libraryChangeTracker from '../library/LibraryChangeTracker';
import logger from '../logger';
import { getAbortController, saveAbortController } from './controlAbortControllers';

const folderWatcherFunction = (
  _eventType: WatchEventType,
  filename: string | null | undefined,
  folder: { id?: number; path: string }
) => {
  if (filename) {
    libraryChangeTracker.markDirty({
      path: folder.path,
      source: 'folder-watcher'
    });
  }
};

export const addWatcherToFolder = (folder: { id?: number; path: string }): void => {
  try {
    const existingController = getAbortController(folder.path);
    if (existingController) {
      return;
    }

    const abortController = new AbortController();
    const watcher = fsSync.watch(
      folder.path,
      {
        signal: abortController.signal
      },
      (eventType, filename) => folderWatcherFunction(eventType, filename, folder)
    );

    logger.debug('Added watcher to a folder successfully.', { folderPath: folder.path });

    watcher.addListener('error', (error) =>
      logger.warn(`Error occurred when watching a folder.`, { error, folderPath: folder.path })
    );
    watcher.addListener('close', () =>
      logger.debug(`Successfully closed the watcher.`, { folderPath: folder.path })
    );
    saveAbortController(folder.path, abortController);
  } catch (error) {
    logger.warn(`Failed to watch folder (path may be inaccessible or unmounted).`, {
      error,
      folderPath: folder.path
    });
  }
};

export const initializePassiveFolderWatchers = (folders: { id?: number; path: string }[]): void => {
  logger.debug(`Initializing passive folder watchers for ${folders.length} folders.`);
  for (const folder of folders) {
    addWatcherToFolder(folder);
  }
};

const addWatchersToFolders = async (folders?: FolderStructure[]): Promise<void> => {
  if (folders && folders.length > 0) {
    for (const folder of folders) {
      addWatcherToFolder(folder);
      if (folder.subFolders && folder.subFolders.length > 0) {
        addWatchersToFolders(folder.subFolders);
      }
    }
    return;
  }

  const { initializePassiveWatchers } = await import('./initializePassiveWatchers');
  await initializePassiveWatchers();
};

export default addWatchersToFolders;
