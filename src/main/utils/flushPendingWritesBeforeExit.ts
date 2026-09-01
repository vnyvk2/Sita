import logger from '../logger';
import { savePendingSongLyrics } from '../saveLyricsToSong';
import { savePendingMetadataUpdates } from '../updateSong/updateSongId3Tags';

/**
 * Flushes pending lyrics and metadata writes for the given song path before the current process
 * terminates (relaunch, restart or exit).
 *
 * Any application restart path MUST await this helper before exiting, otherwise pending file writes
 * are killed mid-flight and can leave half-written tags on disk.
 *
 * Flush errors are logged but never propagated: a failing flush must not block the app from
 * exiting.
 */
export const flushPendingWritesBeforeExit = async (currentSongPath = ''): Promise<void> => {
  try {
    await savePendingSongLyrics(currentSongPath, true);
  } catch (error) {
    logger.error(`Failed to flush pending song lyrics before exit.`, { error });
  }

  try {
    await savePendingMetadataUpdates(currentSongPath, true);
  } catch (error) {
    logger.error(`Failed to flush pending metadata updates before exit.`, { error });
  }
};
