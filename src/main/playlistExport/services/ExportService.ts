import { SaveDialogOptions, shell } from 'electron';
import { writeFile } from 'fs/promises';
import type { PlaylistExportOptions, PlaylistExportFormat } from '@common/collections/types';
import logger from '../../logger';
import { sendMessageToRenderer, showSaveDialog } from '../../main';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import { defaultFormatterRegistry, FormatterRegistry } from '../formatters/FormatterRegistry';

const DEFAULT_OPTIONS: PlaylistExportOptions = {
  format: 'm3u8',
  order: 'customOrder',
  pathType: 'absolute',
  includeExtInf: true
};

export class ExportService {
  constructor(
    private repository: PlaylistRepository,
    private formatterRegistry: FormatterRegistry = defaultFormatterRegistry
  ) {}

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

      // Delegate database querying and entry transformation directly to repository
      const exportEntries = await this.repository.getExportEntries(playlistId, { sortType: finalOptions.order });

      if (exportEntries.length === 0) {
        logger.warn("Failed to export playlist because requested playlist didn't have any songs.", {
          playlistId
        });
        sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName } });
        return;
      }

      const formatter = this.formatterRegistry.get(finalOptions.format);
      const fileData = formatter.format(exportEntries, {
        includeExtInf: finalOptions.includeExtInf
      });

      // Save file as UTF-8 (Modern audio players standard for .m3u / .m3u8)
      await writeFile(destination, fileData, 'utf-8');

      logger.debug(`Exported playlist successfully.`, { playlistId, playlistName, destination });

      sendMessageToRenderer({
        messageCode: 'PLAYLIST_EXPORT_SUCCESS',
        data: { playlistName }
      });

      // Open exported file location after success
      shell.showItemInFolder(destination);

    } catch (error) {
      logger.error(`Failed to export playlist.`, { error, playlistName, playlistId });
      sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName } });
    }
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
