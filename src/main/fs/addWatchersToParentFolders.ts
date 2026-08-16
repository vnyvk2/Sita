import fsSync, { type WatchEventType } from 'fs';
import path from 'path';

import libraryChangeTracker from '../library/LibraryChangeTracker';
import logger from '../logger';
import { getAbortController, saveAbortController } from './controlAbortControllers';
import getParentFolderPaths from './getParentFolderPaths';

const parentFolderWatcherFunction = (
  _eventType: WatchEventType,
  filename: string | null | undefined,
  parentFolderPath: string
) => {
  if (filename) {
    libraryChangeTracker.markDirty({
      path: parentFolderPath,
      source: 'parent-watcher'
    });
  }
};

export const addWatcherToParentFolder = (parentFolderPath: string): void => {
  try {
    const existingController = getAbortController(parentFolderPath);
    if (existingController) {
      return;
    }

    const abortController = new AbortController();
    const watcher = fsSync.watch(
      parentFolderPath,
      {
        signal: abortController.signal,
        // TODO - recursive mode won't work on linux
        recursive: true
      },
      (eventType, filename) => parentFolderWatcherFunction(eventType, filename, parentFolderPath)
    );
    logger.debug('Added watcher to a parent folder successfully.', { parentFolderPath });

    watcher.addListener('error', (error) =>
      logger.warn(`Error occurred when watching a parent folder.`, { error, parentFolderPath })
    );
    watcher.addListener('close', () =>
      logger.debug(`Successfully closed the parent folder watcher.`, { parentFolderPath })
    );
    saveAbortController(parentFolderPath, abortController);
  } catch (error) {
    logger.warn(`Failed to watch parent folder (path may be inaccessible or unmounted).`, {
      error,
      parentFolderPath
    });
  }
};

export const initializePassiveParentWatchers = (folderPaths: string[]): void => {
  const parentFolderPaths = getParentFolderPaths(folderPaths);
  logger.debug(
    `Initializing passive parent watchers for ${parentFolderPaths.length} parent paths.`
  );

  for (const parentFolderPath of parentFolderPaths) {
    try {
      addWatcherToParentFolder(parentFolderPath);
    } catch (error) {
      logger.warn(`Failed to add watcher to '${path.basename(parentFolderPath)}' parent folder.`, {
        error,
        parentFolderPath
      });
    }
  }
};

const addWatchersToParentFolders = async (): Promise<void> => {
  const { initializePassiveWatchers } = await import('./initializePassiveWatchers');
  await initializePassiveWatchers();
};

export default addWatchersToParentFolders;
