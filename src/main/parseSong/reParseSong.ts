import fs from 'fs/promises';
import path from 'path';

import { db } from '@main/db/db';
import { saveArtworks, syncSongArtworks } from '@main/db/queries/artworks';
import { getSongByPath, updateSongByPath } from '@main/db/queries/songs';
import { metadataOverrides, type songs } from '@main/db/schema';
import { convertToSongData } from '@main/utils/convert';
import { and, eq } from 'drizzle-orm';
import { File } from 'node-taglib-sharp';

import { removeDefaultAppProtocolFromFilePath, resetArtworkCache } from '../fs/resolveFilePaths';
import logger from '../logger';
import { dataUpdateEvent, sendMessageToRenderer } from '../main';
import { processArtworkFiles } from '../other/artworks';
import {
  deleteAlbum,
  getAlbumArtistIds,
  getAlbumSongIds,
  unlinkSongFromAlbum
} from '@main/db/queries/albums';
import {
  deleteArtist,
  getArtistAlbumIds,
  getArtistSongIds,
  unlinkSongFromArtist
} from '@main/db/queries/artists';
import { deleteGenre, getGenreSongIds, unlinkSongFromGenre } from '@main/db/queries/genres';
import { extractFrontCover } from '../utils/extractFrontCover';
import { PaletteJob } from '../workers/jobs/paletteJob';
import { libraryScheduler } from '../workers/jobScheduler';
import { detectSongLanguage } from './detectLanguage';
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
  try {
    const songData = await getSongByPath(songPath);
    if (songData) {
      const song = convertToSongData(songData);
      const { songId } = song;
      const stats = await fs.stat(songPath);

      const file = File.createFromPath(songPath);
      let updatedSong: Partial<typeof songs.$inferInsert> | undefined;
      let artistsData: string[] = [];
      let albumArtistsData: string[] = [];
      let albumData: string | undefined;
      let genresData: string[] = [];
      let detectedLanguage: string | undefined;
      let rawPictureBytes: Uint8Array | undefined;

      try {
        const metadata = file.tag;
        const songTitle =
          metadata?.title || path.basename(songPath, path.extname(songPath)) || 'Unknown Title';

        if (metadata) {
          artistsData = getArtistNamesFromSong(metadata.performers.join(', '));
          albumArtistsData = getArtistNamesFromSong(metadata.albumArtists.join(', '));
          albumData = getAlbumInfoFromSong(metadata.album);
          genresData = getGenreInfoFromSong(metadata.genres);
          rawPictureBytes = extractFrontCover(metadata.pictures);
          detectedLanguage = detectSongLanguage(metadata, songPath, songTitle, artistsData);

          updatedSong = {
            title: songTitle,
            duration: Number(
              getSongDurationFromSong(file.properties.durationMilliseconds / 1000).toFixed(2)
            ),
            year: metadata.year || undefined,
            path: songPath,
            sampleRate: file.properties.audioSampleRate,
            bitRate: file.properties.audioBitrate
              ? Math.ceil(file.properties.audioBitrate)
              : undefined,
            noOfChannels: file.properties.audioChannels,
            diskNumber: metadata.disc ?? undefined,
            trackNumber: metadata.track ?? undefined,
            musicBrainzRecordingId:
              metadata.musicBrainzTrackId || (metadata as any).musicBrainzRecordingId || null,
            isrc: metadata.isrc || null,
            fileCreatedAt: stats ? stats.birthtime : new Date(),
            fileModifiedAt: stats ? stats.mtime : new Date()
          };
        }
      } finally {
        file.dispose?.();
      }

      if (updatedSong) {
        const processedArtwork = await processArtworkFiles('songs', rawPictureBytes);

        // Baseline pre-reparse linkages for differential cleanup (DEF-SCN-02)
        const previousAlbumId =
          song.album?.albumId != null ? Number(song.album.albumId) : undefined;
        const previousArtistIds = Array.isArray(song.artists)
          ? song.artists
              .map((a) => Number(a.artistId))
              .filter((id) => !Number.isNaN(id) && id > 0)
          : [];
        const previousGenreIds = Array.isArray(song.genres)
          ? song.genres
              .map((g) => Number(g.genreId))
              .filter((id) => !Number.isNaN(id) && id > 0)
          : [];

        const reparseResult = await db.transaction(async (trx) => {
          // Check if user manually set a language override
          const userOverride = await trx.query?.metadataOverrides?.findFirst?.({
            where: and(
              eq(metadataOverrides.entityKind, 'song'),
              eq(metadataOverrides.entityId, String(songData.id)),
              eq(metadataOverrides.fieldId, 'language')
            )
          });

          if (userOverride?.stringValue) {
            updatedSong.language = userOverride.stringValue;
          } else {
            updatedSong.language = detectedLanguage;
          }

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
            {
              artworkId: artworkData ? artworkData[0].id : undefined,
              songId: songData.id,
              songGenres: genresData
            },
            trx
          );

          // Differential cleanup: Only unlink entities that are no longer associated with the song,
          // and only delete an entity if it has zero remaining songs. This preserves favorites,
          // overrides, and metadata for single-track artists and albums (DEF-SCN-02).

          // 1. Albums: if the song moved to a different album or album was cleared
          let isAlbumDeleted = false;
          let isArtistDeleted = false;
          const targetAlbumId = relevantAlbum?.id;
          if (previousAlbumId !== undefined && previousAlbumId !== targetAlbumId) {
            await unlinkSongFromAlbum(previousAlbumId, songData.id, trx);
            const remainingAlbumSongs = await getAlbumSongIds(previousAlbumId, trx);
            if (remainingAlbumSongs.length === 0) {
              const oldAlbumArtistIds = await getAlbumArtistIds(previousAlbumId, trx);
              await deleteAlbum(previousAlbumId, trx);
              isAlbumDeleted = true;
              for (const albumArtistId of oldAlbumArtistIds) {
                const remainingSongs = await getArtistSongIds(albumArtistId, trx);
                const remainingAlbums = await getArtistAlbumIds(albumArtistId, trx);
                if (remainingSongs.length === 0 && remainingAlbums.length === 0) {
                  await deleteArtist(albumArtistId, trx);
                  isArtistDeleted = true;
                }
              }
            }
          }

          // 2. Artists: only unlink artists that are no longer associated with this song
          const activeArtistIds = new Set(
            [...(relevantArtists || []), ...(newArtists || [])].map((a) => a.id)
          );
          for (const prevArtistId of previousArtistIds) {
            if (!activeArtistIds.has(prevArtistId)) {
              await unlinkSongFromArtist(prevArtistId, songData.id, trx);
              const remainingArtistSongs = await getArtistSongIds(prevArtistId, trx);
              const remainingArtistAlbums = await getArtistAlbumIds(prevArtistId, trx);
              if (remainingArtistSongs.length === 0 && remainingArtistAlbums.length === 0) {
                await deleteArtist(prevArtistId, trx);
                isArtistDeleted = true;
              }
            }
          }

          // 3. Genres: only unlink genres that are no longer associated with this song
          let isGenreDeleted = false;
          const activeGenreIds = new Set(
            [...(relevantGenres || []), ...(newGenres || [])].map((g) => g.id)
          );
          for (const prevGenreId of previousGenreIds) {
            if (!activeGenreIds.has(prevGenreId)) {
              await unlinkSongFromGenre(prevGenreId, songData.id, trx);
              const remainingGenreSongs = await getGenreSongIds(prevGenreId, trx);
              if (remainingGenreSongs.length === 0) {
                await deleteGenre(prevGenreId, trx);
                isGenreDeleted = true;
              }
            }
          }

          return {
            songData,
            savedArtworkData: artworkData,
            linkedArtworks,
            relevantAlbum,
            newAlbum,
            newArtists,
            relevantArtists,
            newGenres,
            relevantGenres,
            relevantAlbumArtists,
            newAlbumArtists,
            isAlbumDeleted,
            isArtistDeleted,
            isGenreDeleted
          };
        });

        libraryScheduler.requestMaintenance();

        if (reparseResult.savedArtworkData && reparseResult.savedArtworkData.length > 0) {
          const targetArtwork =
            reparseResult.savedArtworkData.find((a) => a.isOptimized) ||
            reparseResult.savedArtworkData[0];
          libraryScheduler.enqueue(
            new PaletteJob(targetArtwork.id, targetArtwork.path, song.title || 'Song')
          );
        }

        logger.debug(`Song reparsed successfully.`, {
          songPath: song?.path
        });
        sendMessageToRenderer({
          messageCode: 'SONG_REPARSE_SUCCESS',
          data: { title: song.title }
        });

        resetArtworkCache('albumArtworks');
        resetArtworkCache('songArtworks');

        dataUpdateEvent('songs/updatedSong', [songId]);
        dataUpdateEvent('songs/artworks');
        dataUpdateEvent('artists/updatedArtist');
        dataUpdateEvent('albums/updatedAlbum');
        dataUpdateEvent('genres/updatedGenre');
        if (reparseResult.isArtistDeleted) {
          dataUpdateEvent('artists/deletedArtist');
        }
        if (reparseResult.isAlbumDeleted) {
          dataUpdateEvent('albums/deletedAlbum');
        }
        if (reparseResult.isGenreDeleted) {
          dataUpdateEvent('genres/deletedGenre');
        }

        return song;
      }
    }
    return undefined;
  } catch (error) {
    logger.error('Error occurred when re-parsing the song.', { error, filePath });
    sendMessageToRenderer({
      messageCode: 'SONG_REPARSE_FAILED',
      data: { path: songPath }
    });
    return undefined;
  }
};

export default reParseSong;
