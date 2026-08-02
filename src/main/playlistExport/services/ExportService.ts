import { SaveDialogOptions, shell } from 'electron';
import { writeFile } from 'fs/promises';
import { inArray, eq } from 'drizzle-orm';
import { db } from '@main/db/db';
import { artists, artistsSongs } from '@main/db/schema';
import type { PlaylistExportOptions, PlaylistExportFormat } from '@common/collections/types';
import logger from '../../logger';
import { sendMessageToRenderer, showSaveDialog } from '../../main';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import type { ExportEntry } from '../formatters/PlaylistFormatter';
import { defaultFormatterRegistry, FormatterRegistry } from '../formatters/FormatterRegistry';

export class ExportService {
  constructor(
    private repository: PlaylistRepository,
    private formatterRegistry: FormatterRegistry = defaultFormatterRegistry
  ) {}

  async exportPlaylist(
    playlistId: number,
    options: PlaylistExportOptions
  ): Promise<void> {
    const collection = await this.repository.getById(playlistId);

    if (!collection) {
      logger.warn("Failed to export playlist because requested playlist didn't exist", {
        playlistId
      });
      sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName: '' } });
      return;
    }

    const playlistName = collection.name;
    const saveOptions = this.generateSaveDialogOptions(playlistName, options.format);

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

      const entries = await this.repository.getEntries(playlistId, { sortType: options.order });

      if (entries.length === 0) {
        logger.warn("Failed to export playlist because requested playlist didn't have any songs.", {
          playlistId
        });
        sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName } });
        return;
      }

      const songIds = entries.map((e) => e.song.id);

      // Fetch artists to include in EXTINF
      const songArtistsRecords = await db
        .select({ songId: artistsSongs.songId, artistName: artists.name })
        .from(artistsSongs)
        .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
        .where(inArray(artistsSongs.songId, songIds));

      const artistsMap = new Map<number, string[]>();
      for (const record of songArtistsRecords) {
        const existing = artistsMap.get(record.songId) || [];
        existing.push(record.artistName);
        artistsMap.set(record.songId, existing);
      }

      // Map to ExportEntry
      const exportEntries: ExportEntry[] = entries.map((e) => {
        const songArtists = artistsMap.get(e.song.id);
        const artist = songArtists && songArtists.length > 0 ? songArtists.join(', ') : undefined;

        let resolvedPath = e.song.path;

        return {
          title: e.song.title,
          artist,
          duration: Number(e.song.duration),
          resolvedPath
        };
      });

      const formatter = this.formatterRegistry.get(options.format);
      const fileData = formatter.format(exportEntries, {
        includeExtInf: options.includeExtInf ?? true
      });

      // Save file as UTF-8
      await writeFile(destination, fileData, 'utf-8');

      logger.debug(`Exported playlist successfully.`, { playlistId, playlistName, destination });

      sendMessageToRenderer({
        messageCode: 'PLAYLIST_EXPORT_SUCCESS',
        data: { playlistName }
      });

      // Feature: Open exported file location after success
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
