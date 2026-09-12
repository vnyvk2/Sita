import path from 'path';

import type { OpenDialogOptions } from 'electron';

import type {
  PlaylistImportIpcOptions,
  PlaylistImportAnalysis
} from '../../common/collections/types';
import logger from '../logger';
import { sendMessageToRenderer, sendProgressToRenderer, showOpenDialog } from '../main';
import { executePlaylistBatch } from '../playlistBatch/ipc/setupPlaylistBatchIpc';
import { playlistBatchOrchestrator, playlistBatchPlanner } from '../playlistBatch/setup';
import type { PlaylistImportWorkflow } from '../playlistImport/workflow/PlaylistImportWorkflow';

const DEFAULT_IMPORT_DIALOG_OPTIONS: OpenDialogOptions = {
  title: 'Select Playlist files to import',
  buttonLabel: 'Import Playlists',
  properties: ['openFile', 'multiSelections'],
  filters: [
    { name: 'M3U/M3U8 Files', extensions: ['m3u', 'm3u8'] },
    { name: 'All Files', extensions: ['*'] }
  ]
};

const resolveImportFilePath = async (filePathInput?: string): Promise<string | null> => {
  let filePath = filePathInput;

  if (!filePath) {
    const destinations = await showOpenDialog({
      ...DEFAULT_IMPORT_DIALOG_OPTIONS,
      properties: ['openFile']
    });

    if (!destinations || destinations.length === 0) {
      logger.warn(`Playlist import cancelled: user didn't select a file.`);
      return null;
    }

    [filePath] = destinations;
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext !== '.m3u8' && ext !== '.m3u') {
    logger.warn(`Import failed: selected file type wasn't '.m3u' or '.m3u8'.`, { filePath });
    return null;
  }

  return filePath;
};

export const analyzePlaylistImport = async (
  workflow: PlaylistImportWorkflow,
  filePathInput?: string
): Promise<PlaylistImportAnalysis | null> => {
  const filePath = await resolveImportFilePath(filePathInput);
  if (!filePath) return null;

  const plan = await workflow.createPlanFromFile(filePath);
  return {
    filePath,
    playlistName: plan.playlistName,
    totalEntries: plan.statistics.totalEntries,
    skippedCount: plan.statistics.skippedEntries,
    repairedCount: plan.statistics.repairedEntries
  };
};

/**
 * Executes single playlist import workflow.
 */
const executeSinglePlaylistImport = async (
  workflow: PlaylistImportWorkflow,
  filePath: string,
  options?: PlaylistImportIpcOptions
) => {
  const summary = await workflow.importFile(filePath, {
    targetPlaylistId: options?.targetPlaylistId,
    mode: options?.mode
  });

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
};

/**
 * Dispatcher: routes single-file import to canonical PlaylistImportWorkflow,
 * and multi-file import to PlaylistBatchOrchestrator.
 */
const importPlaylist = async (
  workflow: PlaylistImportWorkflow,
  options?: PlaylistImportIpcOptions
) => {
  try {
    // 1. If an explicit filePath is passed, execute single-playlist flow directly
    if (options?.filePath) {
      const ext = path.extname(options.filePath).toLowerCase();
      if (ext !== '.m3u8' && ext !== '.m3u') {
        logger.warn(`Import failed: selected file type wasn't '.m3u' or '.m3u8'.`, {
          filePath: options.filePath
        });
        return sendMessageToRenderer({
          messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_EXTENSION'
        });
      }
      return await executeSinglePlaylistImport(workflow, options.filePath, options);
    }

    // 2. Open multi-selection dialog
    const destinations = await showOpenDialog(DEFAULT_IMPORT_DIALOG_OPTIONS);

    if (!destinations || destinations.length === 0) {
      return sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
    }

    const validFiles = destinations.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.m3u' || ext === '.m3u8';
    });

    if (validFiles.length === 0) {
      logger.warn(`Import failed: none of selected files were '.m3u' or '.m3u8'.`, {
        destinations
      });
      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_EXTENSION'
      });
    }

    // 3. Dispatch: 1 file -> single import workflow (conflict prompt preserved)
    if (validFiles.length === 1) {
      return await executeSinglePlaylistImport(workflow, validFiles[0], options);
    }

    // 4. Dispatch: >1 files -> batch orchestrator (sequential + coalesced)
    return await executePlaylistBatch(
      playlistBatchPlanner,
      playlistBatchOrchestrator,
      validFiles,
      sendProgressToRenderer
    );
  } catch (error) {
    logger.error(`Failed to import playlist.`, { error });
    return sendMessageToRenderer({ messageCode: 'PLAYLIST_IMPORT_FAILED' });
  }
};

export default importPlaylist;

