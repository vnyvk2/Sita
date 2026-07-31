import fsSync, { type WatchEventType } from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { getAllFolderStructures } from '@main/db/queries/folders';

import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import { dirExistsSync } from '../utils/dirExists';
import checkFolderForContentModifications from './checkFolderForContentModifications';
import checkFolderForUnknownModifications from './checkFolderForUnknownContentModifications';
import checkForFolderModifications from './checkForFolderModifications';
import { saveAbortController } from './controlAbortControllers';
import { saveFolderStructures } from './parseFolderStructuresForSongPaths';

const checkForFolderUpdates = async (folder: FolderStructure) => {
  try {
    const folderStats = await fs.stat(folder.path);
    const hasFolderModifications =
      folderStats.mtime.toUTCString() !== new Date(folder.stats.lastModifiedDate).toUTCString();

    if (hasFolderModifications) {
      logger.debug(`'${path.basename(folder.path)}' folder has unknown modifications.`, {
        path: folder.path
      });

      folder.stats.lastModifiedDate = folderStats.mtime;

      saveFolderStructures([folder]);
      checkFolderForUnknownModifications(folder.path);
    } else
      logger.debug(`'${path.basename(folder.path)}' folder has no modifications.`, {
        path: folder.path
      });
  } catch (error) {
    logger.error(`Failed to fetch folder stats to check for folder modifications.`, {
      error,
      path: folder.path
    });
  }
};

const folderWatcherFunction = async (
  eventType: WatchEventType,
  filename: string | null | undefined,
  folder: MusicFolderData,
  abortSignal: AbortSignal
) => {
  if (filename) {
    if (eventType === 'rename') {
      const ext = path.extname(filename).toLowerCase();
      const doesFilenameHasSongExtension = supportedMusicExtensions.includes(ext);

      if (doesFilenameHasSongExtension) {
        // possible new song addition
        await checkFolderForContentModifications(folder.path, filename, abortSignal);
      } else if (!ext || ext.length === 0) {
        // possible new subfolder creation/copy event
        const targetSubfolderPath = path.join(folder.path, filename);
        try {
          const stats = await fs.stat(targetSubfolderPath);
          if (stats.isDirectory()) {
            logger.info(`New subfolder detected in watched directory '${folder.path}': '${filename}'`);
            await checkFolderForUnknownModifications(targetSubfolderPath);
          }
        } catch {
          // Subfolder deleted or renamed
          await checkFolderForUnknownModifications(folder.path);
        }
      }
    }
  } else {
    logger.error(
      'Failed to read newly added songs because file watcher function sent undefined as filename.',
      { folderPath: folder.path, eventType, filename }
    );
  }
};

export const addWatcherToFolder = async (folder: MusicFolderData) => {
  try {
    const abortController = new AbortController();
    const watcher = fsSync.watch(
      folder.path,
      {
        signal: abortController.signal
      },
      (eventType, filename) =>
        folderWatcherFunction(eventType, filename, folder, abortController.signal)
    );

    logger.debug('Added watcher to a folder successfully.', { folderPath: folder.path });

    watcher.addListener('error', (error) =>
      logger.warn(`Error occurred when watching a folder.`, { error, folderPath: folder.path })
    );
    watcher.addListener('close', () =>
      logger.debug(`successfully closed the watcher.`, { folderPath: folder.path })
    );
    saveAbortController(folder.path, abortController);
  } catch (error) {
    logger.error(`Error occurred when watching a folder.`, { error, folderPath: folder.path });
  }
};

const addWatchersToFolders = async (folders?: FolderStructure[]) => {
  const musicFolders = folders ?? (await getAllFolderStructures());

  if (folders === undefined)
    logger.debug(`${musicFolders.length} music folders found in user data.`);

  for (const musicFolder of musicFolders) {
    try {
      const doesFolderExist = dirExistsSync(musicFolder.path);

      if (doesFolderExist) {
        await checkForFolderUpdates(musicFolder);
        await addWatcherToFolder(musicFolder);
      } else checkForFolderModifications(path.basename(musicFolder.path));

      if (musicFolder.subFolders.length > 0) addWatchersToFolders(musicFolder.subFolders);
    } catch (error) {
      logger.error(`Failed to add a watcher to a folder.`, {
        error,
        folderPath: musicFolder.path
      });
    }
  }
  return;
};

export default addWatchersToFolders;
