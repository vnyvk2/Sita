import fs from 'fs/promises';
import path from 'path';

import { db } from '@main/db/db';
import { isSongWithPathAvailable, saveSong } from '@main/db/queries/songs';
import type { albums, artists, genres, songs } from '@main/db/schema';
import { File } from 'node-taglib-sharp';

import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import { processArtworkFiles } from '../other/artworks';
import { linkArtworksToSong, saveArtworks } from '@main/db/queries/artworks';
import { extractFrontCover } from '../utils/extractFrontCover';
import manageAlbumArtistOfParsedSong from './manageAlbumArtistOfParsedSong';
import manageAlbumsOfParsedSong from './manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from './manageArtistsOfParsedSong';
import manageGenresOfParsedSong from './manageGenresOfParsedSong';
// import { timeEnd, timeStart } from './utils/measureTimeUsage';

const pathsQueue = new Set<string>();
export const ARTIST_SEPARATOR_REGEX = /[,&]/gm;

export interface ParseSongResult {
  songData: typeof songs.$inferSelect;
  relevantAlbum: typeof albums.$inferSelect | undefined;
  newAlbum: typeof albums.$inferSelect | undefined;
  newArtists: typeof artists.$inferSelect[];
  relevantArtists: typeof artists.$inferSelect[];
  newGenres: typeof genres.$inferSelect[];
  relevantGenres: typeof genres.$inferSelect[];
  relevantAlbumArtists: typeof artists.$inferSelect[];
  newAlbumArtists: typeof artists.$inferSelect[];
}

export const tryToParseSong = (
  songPath: string,
  folderId?: number,
  reparseToSync = false,
  noRendererMessages = false
) => {
  let timeOutId: NodeJS.Timeout;

  const songFileName = path.basename(songPath);
  const isSongInPathsQueue = pathsQueue.has(songPath);

  // Here paths queue is used to prevent parsing the same song multiple times due to the event being fired multiple times for the same song even before they are parsed. So if the same is going to start the parsing process, it will stop the process if the song path is in the songPaths queue.
  if (!isSongInPathsQueue) {
    pathsQueue.add(songPath);

    const tryParseSong = async (errRetryCount = 0): Promise<ParseSongResult | undefined> => {
      try {
        const result = await parseSong(songPath, folderId, reparseToSync, noRendererMessages);
        logger.debug(`song added to the library.`, { songPath });

        pathsQueue.delete(songPath);
        return result;
      } catch (error) {
        if (errRetryCount < 5) {
          // THIS ERROR OCCURRED WHEN THE APP STARTS READING DATA WHILE THE SONG IS STILL WRITING TO THE DISK. POSSIBLE SOLUTION IS TO SET A TIMEOUT AND REDO THE PROCESS.
          if (timeOutId) clearTimeout(timeOutId);
          logger.debug('Failed to parse song data. Retrying in 5 seconds. (error: read error)', {
            error
          });
          // Note: using a Promise wrapper to allow the recursive call to return its result
          return new Promise((resolve, reject) => {
            timeOutId = setTimeout(() => {
              tryParseSong(errRetryCount + 1).then(resolve).catch(reject);
            }, 5000);
          });
        } else {
          logger.debug(
            `Failed to parse a newly added song while the app is open. Failed 5 of 5 retry efforts.`,
            { error }
          );
          sendMessageToRenderer({
            messageCode: 'PARSE_FAILED',
            data: { name: songFileName }
          });
          pathsQueue.delete(songPath);
          throw error;
        }
      }
    };

    return tryParseSong();
  }
  logger.info('Song parsing ignored because it is not eligible.', {
    songPath,
    reason: {
      isSongInPathsQueue
    }
  });
  return undefined;
};

const parseQueue = new Set<string>();

export const parseSong = async (
  absoluteFilePath: string,
  folderId?: number,
  reparseToSync = false,
  noRendererMessages = false
): Promise<ParseSongResult | undefined> => {
  // const start = timeStart();
  logger.debug(`Starting the parsing process of song '${path.basename(absoluteFilePath)}'.`);

  // Check if already parsing this file (prevents concurrent parses of same file)
  const isSongInParseQueue = parseQueue.has(absoluteFilePath);
  if (isSongInParseQueue) {
    logger.debug('Song not eligable for parsing.', {
      absoluteFilePath,
      reason: {
        isSongInParseQueue
      }
    });
    return undefined;
  }

  try {
    const stats = await fs.stat(absoluteFilePath);
    const file = File.createFromPath(absoluteFilePath);

    let isSongEligibleForParsing = false;
    let songTitle = '';
    let artistsData: string[] = [];
    let albumArtistsData: string[] = [];
    let albumData: string | undefined;
    let genresData: string[] = [];
    let songInfo: typeof songs.$inferInsert | undefined;
    let rawPictureBytes: Uint8Array | undefined;

    try {
      const metadata = file.tag;
      const isSongAvailable = await isSongWithPathAvailable(absoluteFilePath);
      isSongEligibleForParsing = Boolean(metadata && (reparseToSync || !isSongAvailable));

      if (isSongEligibleForParsing) {
        parseQueue.add(absoluteFilePath);

        songTitle =
          metadata.title ||
          path.basename(absoluteFilePath, path.extname(absoluteFilePath)) ||
          'Unknown Title';

        artistsData = getArtistNamesFromSong(metadata.performers.join(', '));
        albumArtistsData = getArtistNamesFromSong(metadata.albumArtists.join(', '));
        albumData = getAlbumInfoFromSong(metadata.album);
        genresData = getGenreInfoFromSong(metadata.genres);

        songInfo = {
          title: songTitle,
          duration: getSongDurationFromSong(file.properties.durationMilliseconds / 1000).toFixed(2),
          year: metadata.year || undefined,
          path: absoluteFilePath,
          sampleRate: file.properties.audioSampleRate,
          bitRate: file.properties.audioBitrate ? Math.ceil(file.properties.audioBitrate) : undefined,
          noOfChannels: file.properties.audioChannels,
          diskNumber: metadata.disc ?? undefined,
          trackNumber: metadata.track ?? undefined,
          musicBrainzRecordingId: metadata.musicBrainzTrackId || (metadata as any).musicBrainzRecordingId || undefined,
          isrc: metadata.isrc || undefined,
          fileCreatedAt: stats ? stats.birthtime : new Date(),
          fileModifiedAt: stats ? stats.mtime : new Date(),
          folderId
        };

        rawPictureBytes = extractFrontCover(metadata.pictures);
      }
    } finally {
      file.dispose?.();
    }

    if (isSongEligibleForParsing && songInfo) {
      const processedArtwork = await processArtworkFiles('songs', rawPictureBytes);

      const res = await db.transaction(async (trx) => {
        const songData = await saveSong(songInfo, trx);

        let artworkData = processedArtwork.existing;
        if (!artworkData && processedArtwork.payloads) {
          artworkData = await saveArtworks(processedArtwork.payloads, trx);
        }

        await linkArtworksToSong(
          artworkData && artworkData.length > 0
            ? artworkData.map((artwork) => ({ songId: songData.id, artworkId: artwork.id }))
            : [],
          trx
        );

        // const start8 = timeEnd(start6, 'Time to create songInfo basic object');

        const { relevantAlbum, newAlbum } = await manageAlbumsOfParsedSong(
          {
            songId: songData.id,
            artworkId: artworkData && artworkData.length > 0 ? artworkData[0].id : undefined,
            songYear: songData.year,
            artists: artistsData,
            albumArtists: albumArtistsData,
            albumName: albumData
          },
          trx
        );

        const { newArtists, relevantArtists } = await manageArtistsOfParsedSong(
          {
            songId: songData.id,
            artworkId: artworkData?.[0]?.id,
            songArtists: artistsData
          },
          trx
        );

        const { newAlbumArtists, relevantAlbumArtists } = await manageAlbumArtistOfParsedSong(
          { albumArtists: albumArtistsData, albumId: relevantAlbum?.id },
          trx
        );

        const { newGenres, relevantGenres } = await manageGenresOfParsedSong(
          {
            songId: songData.id,
            artworkId: artworkData?.[0]?.id,
            songGenres: genresData
          },
          trx
        );

        return {
          songData,
          relevantAlbum,
          newAlbum,
          newArtists,
          relevantArtists,
          newGenres,
          relevantGenres,
          relevantAlbumArtists,
          newAlbumArtists
        };
      });

      logger.debug(`Song parsing completed successfully.`, {
        songId: res.songData.id,
        title: res.songData.title,
        artistCount: res.relevantArtists.length,
        albumCount: 1,
        genreCount: res.relevantGenres.length
      });

      dataUpdateEvent('songs/newSong', [res.songData.id]);

      parseQueue.delete(absoluteFilePath);

      if (res.newArtists.length > 0) {
        dataUpdateEvent(
          'artists/newArtist',
          res.newArtists.map((x) => x.id)
        );
      }
      if (res.relevantArtists.length > 0) {
        dataUpdateEvent(
          'artists',
          res.relevantArtists.map((x) => x.id)
        );
      }
      if (res.newAlbum) dataUpdateEvent('albums/newAlbum', [res.newAlbum.id]);
      if (res.relevantAlbum) dataUpdateEvent('albums', [res.relevantAlbum.id]);
      if (res.newGenres.length > 0) {
        dataUpdateEvent(
          'genres/newGenre',
          res.newGenres.map((x) => x.id)
        );
      }
      if (res.relevantGenres.length > 0) {
        dataUpdateEvent(
          'genres',
          res.relevantGenres.map((x) => x.id)
        );
      }

      if (!noRendererMessages) {
        sendMessageToRenderer({
          messageCode: 'PARSE_SUCCESSFUL',
          data: { name: songTitle, songId: res.songData.id }
        });
      }

      return res;
    }
    logger.debug('Song not eligable for parsing.', {
      absoluteFilePath,
      reason: {
        isSongArrayAvailable: true
      }
    });
    return undefined;
  } catch (error) {
    logger.error(`Error occurred when parsing a song.`, {
      error,
      absoluteFilePath
    });
    throw error;
  } finally {
    parseQueue.delete(absoluteFilePath);
  }
};

export const getArtistNamesFromSong = (artists?: string) => {
  if (artists) {
    const splittedArtists = artists
      .split(ARTIST_SEPARATOR_REGEX)
      .map((artist) => artist.trim())
      .filter((a) => a.length > 0);

    return splittedArtists;
  }
  return [];
};

export const getSongDurationFromSong = (duration?: number) => {
  if (typeof duration === 'number') {
    const fixedDuration = duration.toFixed(2);
    return parseFloat(fixedDuration);
  }
  return 0;
};

export const getAlbumInfoFromSong = (album?: string) => {
  if (album) return album;
  return undefined;
};

export const getGenreInfoFromSong = (genres?: string[]) => {
  if (Array.isArray(genres) && genres.length > 0) return genres;

  return [];
};
