import path from 'path';
import type { OpenDialogOptions } from 'electron';
import logger from '../logger';
import { sendMessageToRenderer, showOpenDialog } from '../main';
import type { PlaylistImportWorkflow } from '../playlistImport/workflow/PlaylistImportWorkflow';
import type { PlaylistImportIpcOptions, PlaylistImportAnalysis } from '../../common/collections/types';

const DEFAULT_IMPORT_DIALOG_OPTIONS: OpenDialogOptions = {
  title: 'Select a Playlist file to import',
  buttonLabel: 'Import Playlist',
  properties: ['openFile'],
  filters: [
    { name: 'M3U/M3U8 Files', extensions: ['m3u', 'm3u8'] },
    { name: 'All Files', extensions: ['*'] }
  ]
};

const resolveImportFilePath = async (filePathInput?: string): Promise<string | null> => {
  let filePath = filePathInput;

  if (!filePath) {
    const destinations = await showOpenDialog(DEFAULT_IMPORT_DIALOG_OPTIONS);

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
 * Lightweight compatibility wrapper delegating playlist import execution
 * exclusively to the canonical PlaylistImportWorkflow framework via Dependency Injection.
 */
const importPlaylist = async (
  workflow: PlaylistImportWorkflow,
  options?: PlaylistImportIpcOptions
) => {
  try {
    const filePath = await resolveImportFilePath(options?.filePath);

    if (!filePath) {
      return sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
    }

    // Delegate analysis, planning, and execution exclusively to PlaylistImportWorkflow
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
  } catch (error) {
    logger.error(`Failed to import playlist via PlaylistImportWorkflow.`, { error });
    return sendMessageToRenderer({ messageCode: 'PLAYLIST_IMPORT_FAILED' });
  }
};

export default importPlaylist;
