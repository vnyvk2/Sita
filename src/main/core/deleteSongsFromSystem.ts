import fs from 'fs/promises';
import path from 'path';

import { shell } from 'electron';

import { getSongByPath } from '../db/queries/songs';
import { supportedMusicExtensions } from '../filesystem';
import logger from '../logger';
import removeSongsFromLibrary from '../removeSongsFromLibrary';

const deleteSongsFromSystem = async (
  absoluteFilePaths: string[],
  abortSignal: AbortSignal,
  isPermanentDelete = false
) => {
  if (abortSignal.aborted) {
    logger.debug(`Song deletion process aborted because abort event triggered.`);
    throw new Error('Song deletion process aborted because abort event triggered.');
  }

  logger.debug(`Started the deletion process of '${absoluteFilePaths.length}' songs.`, {
    absoluteFilePaths
  });

  const isEveryPathASong = absoluteFilePaths.every((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return supportedMusicExtensions.includes(ext);
  });

  if (!isEveryPathASong) {
    const errMessage = `Tried to delete a resource which is recognized as a song.`;
    logger.error(errMessage, {
      path: absoluteFilePaths
    });
    throw new Error(errMessage);
  }

  try {
    // The paths arrive over IPC, so the extension check alone cannot be trusted:
    // only files that actually belong to a library song may be removed. Anything
    // else is skipped instead of being irreversibly deleted.
    const verifiedPaths: string[] = [];
    for (const filePath of absoluteFilePaths) {
      if (abortSignal.aborted) {
        throw new Error('Song deletion process aborted because abort event triggered.');
      }

      const song = await getSongByPath(filePath);
      if (song == null) {
        logger.warn(
          'Skipping deletion of a file that does not belong to any song in the library.',
          { filePath }
        );
        continue;
      }
      verifiedPaths.push(filePath);
    }

    if (verifiedPaths.length === 0) {
      return {
        success: true,
        message: `No files matching library songs were found to delete.`
      };
    }

    const res = await removeSongsFromLibrary(verifiedPaths, abortSignal);

    if (res?.success) {
      for (const filePath of verifiedPaths) {
        if (isPermanentDelete) await fs.unlink(filePath);
        else await shell.trashItem(filePath);
      }
    }

    return {
      success: true,
      message: `Successfully ${
        isPermanentDelete
          ? `deleted ${verifiedPaths.length} songs from the system`
          : `moved ${verifiedPaths.length} songs to the recycle bin`
      }.`
    };
  } catch (error) {
    logger.error(`Failed to remove a song from the system`, { error });
    return { success: false };
  }
};

export default deleteSongsFromSystem;
