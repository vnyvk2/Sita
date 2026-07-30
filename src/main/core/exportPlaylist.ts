import type { SaveDialogOptions } from 'electron';
import { writeFile } from 'fs/promises';
import { basename } from 'path';
import { inArray } from 'drizzle-orm';
import { db } from '@main/db/db';
import { songs } from '@main/db/schema';
import logger from '../logger';
import { sendMessageToRenderer, showSaveDialog } from '../main';
import type { PlaylistRepository } from '../collections/repositories/PlaylistRepository';

const generateSaveDialogOptions = (playlistName: string) => {
  const saveOptions: SaveDialogOptions = {
    title: `Select the destination to save '${playlistName}' playlist`,
    buttonLabel: 'Save Playlist',
    defaultPath: playlistName,
    nameFieldLabel: playlistName,
    filters: [
      {
        extensions: ['m3u8'],
        name: 'M3U8 Files'
      }
    ],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  };

  return saveOptions;
};

const createM3u8FileForPlaylist = async (
  playlistId: number,
  playlistName: string,
  songPaths: string[]
) => {
  const saveOptions = generateSaveDialogOptions(playlistName);

  try {
    const destination = await showSaveDialog(saveOptions);

    if (destination) {
      const m3u8DataArr = ['#EXTM3U', `#${basename(destination)}`, ''];

      m3u8DataArr.push(...songPaths);

      const m3u8FileData = m3u8DataArr.join('\n');

      await writeFile(destination, m3u8FileData);

      logger.debug(`Exported playlist successfully.`, { playlistId, playlistName });
      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_EXPORT_SUCCESS',
        data: { playlistName }
      });
    }
    logger.warn(`Failed to export playlist because user didn't select a destination.`, {
      playlistName,
      playlistId
    });
    return sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
  } catch (error) {
    logger.debug(`Failed to export playlist.`, { error, playlistName, playlistId });
    return sendMessageToRenderer({ messageCode: 'PLAYLIST_EXPORT_FAILED', data: { playlistName } });
  }
};

const exportPlaylist = async (playlistId: number, repository: PlaylistRepository) => {
  const collection = await repository.getById(playlistId);

  if (!collection)
    return logger.warn("Failed to export playlist because requested playlist didn't exist", {
      playlistId
    });

  const entries = await repository.getEntries(playlistId);

  if (entries.length === 0)
    return logger.warn(
      "Failed to export playlist because requested playlist didn't have any songs.",
      {
        playlistId
      }
    );

  const songIds = entries.map((e) => e.entry.songId);
  const songRecords = await db.select({ path: songs.path }).from(songs).where(inArray(songs.id, songIds));
  const songPaths = songRecords.map((s) => s.path);

  return await createM3u8FileForPlaylist(collection.id, collection.name, songPaths);
};

export default exportPlaylist;
