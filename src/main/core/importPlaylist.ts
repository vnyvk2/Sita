import path from 'path';
import type { OpenDialogOptions } from 'electron';
import logger from '../logger';
import { sendMessageToRenderer, showOpenDialog } from '../main';
import type { PlaylistImportWorkflow } from '../playlistImport/workflow/PlaylistImportWorkflow';

const DEFAULT_IMPORT_DIALOG_OPTIONS: OpenDialogOptions = {
  title: 'Select a Playlist file to import',
  buttonLabel: 'Import Playlist',
  properties: ['openFile'],
  filters: [
    { name: 'M3U/M3U8 Files', extensions: ['m3u', 'm3u8'] },
    { name: 'All Files', extensions: ['*'] }
  ]
};

/**
 * Lightweight compatibility wrapper delegating playlist import execution
 * exclusively to the canonical PlaylistImportWorkflow framework via Dependency Injection.
 */
const importPlaylist = async (
  workflow: PlaylistImportWorkflow,
  _targetPlaylistId?: number
) => {
  try {
    const destinations = await showOpenDialog(DEFAULT_IMPORT_DIALOG_OPTIONS);

    if (!destinations || destinations.length === 0) {
      logger.warn(`Playlist import cancelled: user didn't select a file.`);
      return sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
    }

    const [filePath] = destinations;
    const ext = path.extname(filePath).toLowerCase();

    if (ext !== '.m3u8' && ext !== '.m3u') {
      logger.warn(`Import failed: selected file type wasn't '.m3u' or '.m3u8'.`, { filePath });
      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_EXTENSION'
      });
    }

    // Delegate analysis, planning, and execution exclusively to PlaylistImportWorkflow
    const summary = await workflow.importFile(filePath);

    if (summary.importedCount > 0) {
      logger.info(`Imported playlist '${summary.playlistName}' successfully.`, { summary });

      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_SUCCESS',
        data: {
          name: summary.playlistName,
          count: summary.importedCount,
          repairedCount: summary.repairedCount,
          skippedCount: summary.skippedCount,
          totalPlanned: summary.totalPlanned
        }
      });
    } else {
      logger.warn(`Import finished but 0 songs were imported from library.`, { summary });

      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_SONGS_OUTSIDE_LIBRARY',
        data: { count: summary.skippedCount }
      });
    }
  } catch (error) {
    logger.error(`Failed to import playlist via PlaylistImportWorkflow.`, { error });
    return sendMessageToRenderer({ messageCode: 'PLAYLIST_IMPORT_FAILED' });
  }
};

export default importPlaylist;
