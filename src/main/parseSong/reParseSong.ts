import fs from 'fs/promises';
import path from 'path';

import { db } from '@main/db/db';
import { saveArtworks, syncSongArtworks } from '@main/db/queries/artworks';
import { getSongByPath, updateSongByPath } from '@main/db/queries/songs';
import type { songs } from '@main/db/schema';
import { convertToSongData } from '@main/utils/convert';
import { File } from 'node-taglib-sharp';

import { removeDefaultAppProtocolFromFilePath } from '../fs/resolveFilePaths';
import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import { processArtworkFiles } from '../other/artworks';
import { libraryScheduler } from '../workers/jobScheduler';
// (GC job will be dispatched by Maintenance orchestrator)
import { generatePalettes } from '../other/generatePalette';
import {
  removeDeletedAlbumDataOfSong,
  removeDeletedArtistDataOfSong,
  removeDeletedGenreDataOfSong
} from '../removeSongsFromLibrary';
import manageAlbumArtistOfParsedSong from './manageAlbumArtistOfParsedSong';
import manageAlbumsOfParsedSong from './manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from './manageArtistsOfParsedSong';
import manageGenresOfParsedSong from './manageGenresOfParsedSong';
import {
  getAlbumInfoFromSong,
  getArtistNamesFromSong,
  getGenreInfoFromSong,
  getSongDurationFromSong
} from './parseSong';

const reParseSong = async (filePath: string) => {
  const songPath = removeDefaultAppProtocolFromFilePath(filePath);
  const songData = await getSongByPath(songPath);
  try {
    if (songData) {
      const song = convertToSongData(songData);
      const { songId } = song;
      const stats = await fs.stat(songPath);

      const file = File.createFromPath(songPath);
      const metadata = file.tag;

      const songTitle =
        metadata.title || path.basename(songPath, path.extname(songPath)) || 'Unknown Title';

      if (metadata) {
        const updatedSong: Partial<typeof songs.$inferInsert> = {
          title: songTitle,
          duration: getSongDurationFromSong(file.properties.durationMilliseconds / 1000).toFixed(2),
          year: metadata.year || undefined,
          path: songPath,
          sampleRate: file.properties.audioSampleRate,
          bitRate: file.properties.audioBitrate
            ? Math.ceil(file.properties.audioBitrate)
            : undefined,
          noOfChannels: file.properties.audioChannels,
          diskNumber: metadata.disc ?? undefined,
          trackNumber: metadata.track ?? undefined,
          fileCreatedAt: stats ? stats.birthtime : new Date(),
          fileModifiedAt: stats ? stats.mtime : new Date()
        };

        const artistsData = getArtistNamesFromSong(metadata.performers.join(', '));
        const albumArtistsData = getArtistNamesFromSong(metadata.albumArtists.join(', '));
        const albumData = getAlbumInfoFromSong(metadata.album);
        const genresData = getGenreInfoFromSong(metadata.genres);

        const processedArtwork = await processArtworkFiles(
          'songs',
          metadata.pictures?.at(0) ? metadata.pictures[0].data.toByteArray() : undefined
        );

        await db.transaction(async (trx) => {
          await removeDeletedArtistDataOfSong(song, trx);
          await removeDeletedAlbumDataOfSong(song, trx);
          await removeDeletedGenreDataOfSong(song, trx);

          // No need to delete playlists, play events, seek events, or skip events as they will be the same even after re-parsing.

          await updateSongByPath(songPath, updatedSong, trx);

          let artworkData = processedArtwork.existing;
          if (!artworkData && processedArtwork.payloads) {
            artworkData = await saveArtworks(processedArtwork.payloads, trx);
          }

          const linkedArtworks = await syncSongArtworks(
            songData.id,
            artworkData ? artworkData.map((artwork) => artwork.id) : [],
            trx
          );

          const { relevantAlbum, newAlbum } = await manageAlbumsOfParsedSong(
            {
              songId: songData.id,
              artworkId: artworkData ? artworkData[0].id : undefined,
              songYear: songData.year,
              artists: artistsData,
              albumArtists: albumArtistsData,
              albumName: albumData
            },
            trx
          );

          const { newArtists, relevantArtists } = await manageArtistsOfParsedSong(
            {
              artworkId: artworkData ? artworkData[0].id : undefined,
              songId: songData.id,
              songArtists: artistsData
            },
            trx
          );

          const { newAlbumArtists, relevantAlbumArtists } = await manageAlbumArtistOfParsedSong(
            { albumArtists: albumArtistsData, albumId: relevantAlbum?.id },
            trx
          );

          const { newGenres, relevantGenres } = await manageGenresOfParsedSong(
            { artworkId: artworkData ? artworkData[0].id : undefined, songId: songData.id, songGenres: genresData },
            trx
          );

          return {
            songData,
            linkedArtworks,
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
        
        libraryScheduler.requestMaintenance();

        logger.debug(`Song reparsed successfully.`, {
          songPath: song?.path
        });
        sendMessageToRenderer({
          messageCode: 'SONG_REPARSE_SUCCESS',
          data: { title: song.title }
        });

        dataUpdateEvent('songs/updatedSong', [songId]);
        dataUpdateEvent('artists/updatedArtist');
        dataUpdateEvent('albums/updatedAlbum');
        dataUpdateEvent('genres/updatedGenre');

        setTimeout(() => generatePalettes(), 1000);
        return song;
      }
    }
    return undefined;
  } catch (error) {
    logger.error('Error occurred when re-parsing the song.', { error, filePath });
    return sendMessageToRenderer({ messageCode: 'SONG_REPARSE_FAILED' });
  }
};

export default reParseSong;
