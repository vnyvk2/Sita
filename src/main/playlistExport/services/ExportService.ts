import { SaveDialogOptions, shell } from 'electron';
import { writeFile, access } from 'fs/promises';
import { dirname, relative, parse, join } from 'path';
import type {
  PlaylistExportOptions,
  PlaylistExportFormat,
  PlaylistBatchExportOptions,
  BatchExportResult,
  BatchExportItemResult
} from '@common/collections/types';
import logger from '../../logger';
import { sendMessageToRenderer, showSaveDialog, showOpenDialog } from '../../main';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import { defaultFormatterRegistry, FormatterRegistry } from '../formatters/FormatterRegistry';

const DEFAULT_OPTIONS: PlaylistExportOptions = {
  format: 'm3u8',
  order: 'customOrder',
  pathType: 'absolute',
  includeExtInf: true
};

export function sanitizeFilename(name: string): string {
  // Replace invalid filesystem characters \ / : * ? " < > | with underscores
  const sanitized = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return sanitized.length > 0 ? sanitized : 'Playlist';
}

export class ExportService {
  constructor(
    private repository: PlaylistRepository,
    private formatterRegistry: FormatterRegistry = defaultFormatterRegistry
  ) {}

  /**
   * Core execution method: formats and writes a single playlist to a specific destination filepath.
   */
  private async exportSinglePlaylistToFile(
    playlistId: number,
    destinationFilePath: string,
    options: PlaylistExportOptions
  ): Promise<void> {
    const exportEntries = await this.repository.getExportEntries(playlistId, {
      sortType: options.order
    });

    if (exportEntries.length === 0) {
      throw new Error(`Playlist ${playlistId} contains no songs to export.`);
    }

    let processedEntries = exportEntries;

    if (options.pathType === 'relative') {
      const destinationDir = dirname(destinationFilePath);
      const destinationRoot = parse(destinationDir).root.toLowerCase();

      processedEntries = exportEntries.map((entry) => {
        const songRoot = parse(entry.resolvedPath).root.toLowerCase();

        // Fallback to absolute if on different drive root (e.g., C:\ vs D:\)
        if (destinationRoot !== songRoot) {
          return entry;
        }

        const relPath = relative(destinationDir, entry.resolvedPath).replace(/\\/g, '/');

        return {
          ...entry,
          resolvedPath: relPath
        };
      });
    }

    const formatter = this.formatterRegistry.get(options.format);
    const fileData = formatter.format(processedEntries, {
      includeExtInf: options.includeExtInf
    });

    await writeFile(destinationFilePath, fileData, 'utf-8');
  }

  /**
   * Export a single playlist using native Save File dialog.
   */
  async exportPlaylist(
    playlistId: number,
    options?: Partial<PlaylistExportOptions>
  ): Promise<void> {
    const finalOptions: PlaylistExportOptions = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    const collection = await this.repository.getById(playlistId);

    if (!collection) {
      logger.warn("Failed to export playlist because requested playlist didn't exist", {
        playlistId
      });
      sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName: '' } });
      return;
    }

    const playlistName = collection.name;
    const saveOptions = this.generateSaveDialogOptions(playlistName, finalOptions.format);

    try {
      const destination = await showSaveDialog(saveOptions);

      if (!destination) {
        logger.warn(`Failed to export playlist because user didn't select a destination.`, {
          playlistName,
          playlistId
        });
        sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
        return;
      }

      await this.exportSinglePlaylistToFile(playlistId, destination, finalOptions);

      logger.debug(`Exported playlist successfully.`, { playlistId, playlistName, destination });

      sendMessageToRenderer({
        messageCode: 'PLAYLIST_EXPORT_SUCCESS',
        data: { playlistName }
      });

      shell.showItemInFolder(destination);
    } catch (error) {
      logger.error(`Failed to export playlist.`, { error, playlistName, playlistId });
      sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName } });
    }
  }

  /**
   * Export multiple playlists in batch into a destination folder.
   * Auto-resolves filename collisions and isolates errors per playlist.
   */
  async exportPlaylists(
    playlistIds: number[],
    options?: Partial<PlaylistBatchExportOptions>
  ): Promise<BatchExportResult> {
    const finalOptions: PlaylistExportOptions = {
      ...DEFAULT_OPTIONS,
      ...options
    };

    let destinationDir = options?.destinationDir;

    if (!destinationDir) {
      const selectedDirs = await showOpenDialog({
        title: 'Select Destination Folder for Batch Export',
        buttonLabel: 'Select Export Folder',
        properties: ['openDirectory', 'createDirectory']
      });

      if (!selectedDirs || selectedDirs.length === 0) {
        logger.warn(`Batch export cancelled: user didn't select a destination folder.`);
        return {
          totalCount: playlistIds.length,
          items: [],
          destinationDir: ''
        };
      }

      [destinationDir] = selectedDirs;
    }

    const items: BatchExportItemResult[] = [];
    const usedFilenames = new Set<string>();

    const total = playlistIds.length;

    for (let index = 0; index < playlistIds.length; index++) {
      const playlistId = playlistIds[index];
      const collection = await this.repository.getById(playlistId);
      const rawName = collection?.name || `Playlist_${playlistId}`;
      const playlistName = rawName;

      // Report progress to UI
      sendMessageToRenderer({
        messageCode: 'PLAYLIST_BATCH_EXPORT_PROGRESS',
        data: { current: index + 1, total, playlistName }
      });

      if (!collection) {
        items.push({
          playlistId,
          playlistName,
          success: false,
          error: 'Playlist not found in database'
        });
        continue;
      }

      const safeBaseName = sanitizeFilename(playlistName);
      const ext = `.${finalOptions.format}`;
      let candidateFilename = `${safeBaseName}${ext}`;
      let counter = 1;

      while (usedFilenames.has(candidateFilename.toLowerCase()) || (await fileExists(join(destinationDir, candidateFilename)))) {
        candidateFilename = `${safeBaseName} (${counter})${ext}`;
        counter++;
      }

      usedFilenames.add(candidateFilename.toLowerCase());
      const targetFilePath = join(destinationDir, candidateFilename);

      try {
        await this.exportSinglePlaylistToFile(playlistId, targetFilePath, finalOptions);

        logger.info(`Batch export: successfully exported '${playlistName}' to '${targetFilePath}'`);
        items.push({
          playlistId,
          playlistName,
          filePath: targetFilePath,
          success: true
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Batch export failed for playlist '${playlistName}'`, { error: errorMessage, playlistId });

        items.push({
          playlistId,
          playlistName,
          success: false,
          error: errorMessage
        });
      }
    }

    const result: BatchExportResult = {
      totalCount: playlistIds.length,
      items,
      destinationDir
    };

    logger.info(`Batch export completed. Total: ${result.totalCount}, Successful: ${items.filter(i => i.success).length}`);

    // Open target folder upon batch completion
    if (destinationDir) {
      shell.openPath(destinationDir).catch((err) => {
        logger.warn('Could not open export destination folder automatically', { err });
      });
    }

    return result;
  }

  private generateSaveDialogOptions(playlistName: string, format: PlaylistExportFormat): SaveDialogOptions {
    const extension = format;
    const formatLabel = extension === 'm3u' ? 'M3U Playlist (*.m3u)' : 'M3U8 Playlist (*.m3u8)';
    return {
      title: `Select the destination to save '${playlistName}' playlist`,
      buttonLabel: 'Save Playlist',
      defaultPath: playlistName,
      nameFieldLabel: playlistName,
      filters: [
        {
          extensions: [extension],
          name: formatLabel
        }
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    };
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
