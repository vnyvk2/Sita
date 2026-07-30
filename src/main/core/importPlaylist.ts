import { readFile } from 'fs/promises';
import path from 'path';

import { SpecialPlaylists } from '@common/playlists.enum';
import { getPlaylistByName, linkSongsWithPlaylist } from '@main/db/queries/playlists';
import { getSongsInPathList, updateSongFavoriteStatuses } from '@main/db/queries/songs';
import type { OpenDialogOptions } from 'electron';

import { appPreferences } from '../../../package.json';
import logger from '../logger';
import { sendMessageToRenderer, showOpenDialog } from '../main';
import type { PlaylistEngine } from '../collections/engine/PlaylistEngine';

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

interface ParsedM3uTrack {
  rawPath: string;
  resolvedPath: string;
  filename: string;
  filenameWithoutExt: string;
  extinfTitle?: string;
  extinfArtist?: string;
}

const importPlaylist = async (targetPlaylistId?: number, engine?: PlaylistEngine) => {
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

        // 1. Parse M3U file preserving #EXTINF metadata and resolving paths
        const tracks: ParsedM3uTrack[] = [];
        let currentExtinfArtist: string | undefined;
        let currentExtinfTitle: string | undefined;

        for (const rawLine of textArr) {
          const line = rawLine.trim();

          if (line.startsWith('#EXTINF:')) {
            const commaIndex = line.indexOf(',');
            if (commaIndex !== -1) {
              const meta = line.substring(commaIndex + 1).trim();
              const dashIndex = meta.indexOf(' - ');
              if (dashIndex !== -1) {
                currentExtinfArtist = meta.substring(0, dashIndex).trim();
                currentExtinfTitle = meta.substring(dashIndex + 3).trim();
              } else {
                currentExtinfTitle = meta;
              }
            }
            continue;
          }

          if (line.startsWith('#') || line.length === 0) {
            continue;
          }

          const absolutePath = path.isAbsolute(line)
            ? path.normalize(line)
            : path.normalize(path.resolve(m3uDir, line));

          const filename = path.basename(absolutePath);
          const extension = path.extname(filename).split('.').pop() || '';

          if (appPreferences.supportedMusicExtensions.includes(extension.toLowerCase())) {
            const filenameWithoutExt = path.basename(filename, path.extname(filename));

            tracks.push({
              rawPath: line,
              resolvedPath: absolutePath,
              filename,
              filenameWithoutExt,
              extinfArtist: currentExtinfArtist,
              extinfTitle: currentExtinfTitle
            });
          }

          currentExtinfArtist = undefined;
          currentExtinfTitle = undefined;
        }

        if (tracks.length > 0) {
          // Fetch all songs from DB for intelligent multi-tier matching
          const allDbSongs = await db
            .select({
              id: songs.id,
              path: songs.path,
              title: songs.title
            })
            .from(songs);

          const matchedSongIds = new Set<number>();

          for (const track of tracks) {
            // Tier 1: Exact Path Match
            let match = allDbSongs.find((s) => s.path === track.resolvedPath || s.path === track.rawPath);

            // Tier 2: Normalized Path Match (ignore slash direction & case)
            if (!match) {
              const normTrackPath = path.normalize(track.resolvedPath).toLowerCase();
              match = allDbSongs.find((s) => path.normalize(s.path).toLowerCase() === normTrackPath);
            }

            // Tier 3: Filename / Basename Match
            if (!match) {
              const trackFilename = track.filename.toLowerCase();
              match = allDbSongs.find((s) => path.basename(s.path).toLowerCase() === trackFilename);
            }

            // Tier 4: Title Metadata Match (#EXTINF or filename without extension)
            if (!match) {
              const targetTitle = (track.extinfTitle || track.filenameWithoutExt).toLowerCase();
              match = allDbSongs.find((s) => s.title.toLowerCase() === targetTitle);
            }

            if (match) {
              matchedSongIds.add(match.id);
            } else {
              unavailableSongPaths.push(track.resolvedPath);
            }
          }

          availSongIdsForPlaylist.push(...Array.from(matchedSongIds).map((id) => id.toString()));

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
                // Use Collection Platform if engine is provided
                if (engine) {
                  const playlistId = await engine.createPlaylist({ name: playlistName });
                  if (songIdNumbers.length > 0) {
                    await engine.addSongs({ playlistId, songIds: songIdNumbers });
                  }
                  
                  logger.info(`Imported '${fileName}' playlist successfully.`, { fileName });
                  return sendMessageToRenderer({
                    messageCode: 'PLAYLIST_IMPORT_SUCCESS',
                    data: { name: fileName }
                  });
                } else {
                  logger.debug('Failed to create a playlist (no engine provided)', { });
                  return sendMessageToRenderer({
                    messageCode: 'PLAYLIST_IMPORT_FAILED'
                  });
                }
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
