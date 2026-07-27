import { readFile } from 'fs/promises';
import path from 'path';

import { SpecialPlaylists } from '@common/playlists.enum';
import { getPlaylistByName, linkSongsWithPlaylist } from '@main/db/queries/playlists';
import { getSongsInPathList, updateSongFavoriteStatuses } from '@main/db/queries/songs';
import type { OpenDialogOptions } from 'electron';

import { appPreferences } from '../../../package.json';
import logger from '../logger';
import { sendMessageToRenderer, showOpenDialog } from '../main';
import addNewPlaylist from './addNewPlaylist';

const DEFAULT_EXPORT_DIALOG_OPTIONS: OpenDialogOptions = {
  title: `Select a Destination where your M3U8 file is`,
  buttonLabel: 'Select M3U8 file',
  properties: ['openFile'],
  filters: [
    { name: 'M3U/M3U8 Files', extensions: ['m3u', 'm3u8'] },
    { name: 'All Files', extensions: ['*'] }
  ]
};

const resolveSongPath = (text: string, m3uDir: string): string | null => {
  const textLine = text.trim();
  if (textLine.startsWith('#') || textLine.length === 0) return null;

  const absolutePath = path.isAbsolute(textLine) ? textLine : path.resolve(m3uDir, textLine);

  const ext = path.extname(absolutePath).split('.').pop() || '';
  if (appPreferences.supportedMusicExtensions.includes(ext.toLowerCase())) {
    return absolutePath;
  }
  return null;
};

const importPlaylist = async (targetPlaylistId?: number) => {
  try {
    const destinations = await showOpenDialog(DEFAULT_EXPORT_DIALOG_OPTIONS);

    if (destinations) {
      const [filePath] = destinations;

      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.m3u8' || ext === '.m3u') {
        const fileName = path.basename(filePath).replace(/\.m3u8?$/gim, '');
        const m3uDir = path.dirname(filePath);
        const text = await readFile(filePath, 'utf-8');
        const textArr = text.replaceAll('\r', '').split('\n');

        const unavailableSongPaths: string[] = [];
        const availSongIdsForPlaylist: string[] = [];

        // Extract song paths and deduplicate, resolving relative paths
        const songPathsRaw = textArr
          .map((line) => resolveSongPath(line, m3uDir))
          .filter((line): line is string => line !== null);

        const songPaths = Array.from(new Set(songPathsRaw));

        if (songPaths.length > 0) {
          const availableSongs = await getSongsInPathList(songPaths);

          for (const songPath of songPaths) {
            const songData = availableSongs.find((song) => song.path === songPath);

            if (songData) availSongIdsForPlaylist.push(songData.id.toString());
            else unavailableSongPaths.push(songPath);
          }

          // Determine import mode: explicit target takes precedence, then auto-detect by filename
          const isImportingToFavorites =
            targetPlaylistId === SpecialPlaylists.Favorites ||
            fileName.toLowerCase().includes('Favorites');

          if (unavailableSongPaths.length > 0) {
            logger.debug(
              `Found ${unavailableSongPaths.length} songs outside the library when importing a playlist.`,
              {
                unavailableSongPaths
              }
            );
            sendMessageToRenderer({
              messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_SONGS_OUTSIDE_LIBRARY',
              data: { count: unavailableSongPaths.length }
            });

            if (availSongIdsForPlaylist.length === 0) {
              return; // Exit early if NO songs are available, so it doesn't fall through to invalid data
            }
          }

          if (availSongIdsForPlaylist.length > 0) {
            const songIdNumbers = availSongIdsForPlaylist.map((id) => Number(id));

            // Favorites special playlist mode: mark songs as favorite instead of creating playlist
            if (isImportingToFavorites) {
              try {
                await updateSongFavoriteStatuses(songIdNumbers, true);

                logger.info(`Imported ${songIdNumbers.length} songs to Favorites playlist.`, {
                  fileName,
                  importedCount: songIdNumbers.length,
                  unavailableCount: unavailableSongPaths.length,
                  deduplicatedCount: songPathsRaw.length - songPaths.length
                });

                return sendMessageToRenderer({
                  messageCode: 'PLAYLIST_IMPORT_SUCCESS',
                  data: {
                    name: 'Favorites',
                    count: songIdNumbers.length
                  }
                });
              } catch (error) {
                logger.error('Failed to mark songs as favorite during Favorites import.', {
                  fileName,
                  error
                });
                return sendMessageToRenderer({
                  messageCode: 'PLAYLIST_IMPORT_FAILED'
                });
              }
            } else {
              // Normal playlist import mode: create new or link to existing playlist
              const playlistName = fileName;

              const availablePlaylist = await getPlaylistByName(playlistName);

              if (availablePlaylist) {
                try {
                  await linkSongsWithPlaylist(songIdNumbers, availablePlaylist.id);

                  logger.debug(
                    `Imported ${songIdNumbers.length} songs to the existing '${availablePlaylist.name}' playlist.`,
                    {
                      playlistName,
                      availSongIdsForPlaylistCount: songIdNumbers.length,
                      availablePlaylistName: availablePlaylist.name
                    }
                  );

                  return sendMessageToRenderer({
                    messageCode: 'PLAYLIST_IMPORT_TO_EXISTING_PLAYLIST',
                    data: { count: songIdNumbers.length, name: availablePlaylist.name }
                  });
                } catch (error) {
                  logger.error('Failed to import songs to an existing playlist.', {
                    playlistName,
                    error
                  });
                  return sendMessageToRenderer({
                    messageCode: 'PLAYLIST_IMPORT_TO_EXISTING_PLAYLIST_FAILED'
                  });
                }
              } else {
                // Convert number array back to strings for addNewPlaylist API
                const res = await addNewPlaylist(
                  playlistName,
                  songIdNumbers.map((id) => id.toString())
                );

                if (res.success) {
                  logger.info(`Imported '${fileName}' playlist successfully.`, { fileName });
                  return sendMessageToRenderer({
                    messageCode: 'PLAYLIST_IMPORT_SUCCESS',
                    data: { name: fileName }
                  });
                }

                logger.debug('Failed to create a playlist', { res });
                return sendMessageToRenderer({
                  messageCode: 'PLAYLIST_IMPORT_FAILED'
                });
              }
            }
          }
        } else {
          logger.warn(
            `Failed to import the playlist because user selected a file with invalid file data (no valid song paths found).`,
            {
              filePath,
              firstLine: textArr[0]
            }
          );
          return sendMessageToRenderer({
            messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_DATA'
          });
        }
      }
      logger.warn(
        `Failed to import the playlist because user selected a file with a different extension other than 'm3u' or 'm3u8'.`,
        { filePath }
      );
      return sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_FAILED_DUE_TO_INVALID_FILE_EXTENSION'
      });
    }
    logger.warn(`Failed to export a playlist because user didn't select a file.`);
    return sendMessageToRenderer({ messageCode: 'DESTINATION_NOT_SELECTED' });
  } catch (error) {
    logger.error(`Failed to import the playlist.`, { error });
    return sendMessageToRenderer({ messageCode: 'PLAYLIST_IMPORT_FAILED' });
  }
};

export default importPlaylist;
