import path from 'path';

import { db } from './db/db';
import { unlinkSongFromAlbum, getAlbumSongIds, deleteAlbum } from './db/queries/albums';
import { unlinkSongFromArtist, getArtistSongIds, deleteArtist } from './db/queries/artists';
import { getArtworkIdsOfSong } from './db/queries/artworks';
import { unlinkSongFromGenre } from './db/queries/genres';
import { getSongByPath, removeSongById } from './db/queries/songs';
import logger from './logger';
import { dataUpdateEvent, sendMessageToRenderer } from './main';
import { convertToSongData } from './utils/convert';
import { sweepUnusedArtworks } from './other/artworks';

export const removeDeletedArtistDataOfSong = async (song: SavableSongData, trx: DBTransaction) => {
  let isArtistRemoved = false;

  if (Array.isArray(song.artists) && song.artists.length > 0) {
    for (let i = 0; i < song.artists.length; i += 1) {
      const songArtist = song.artists[i];
      const artistId = Number(songArtist.artistId);

      await unlinkSongFromArtist(artistId, Number(song.songId), trx);

      const songIds = await getArtistSongIds(artistId, trx);
      if (songIds.length === 0) {
        await deleteArtist(artistId, trx);
        isArtistRemoved = true;
      }
    }
  }
  return { isArtistRemoved };
};

export const removeDeletedAlbumDataOfSong = async (song: SavableSongData, trx: DBTransaction) => {
  let isAlbumRemoved = false;

  const albumId = song.album?.albumId;
  if (albumId == null) return { isAlbumRemoved };

  const parsedAlbumId = Number(albumId);
  await unlinkSongFromAlbum(parsedAlbumId, Number(song.songId), trx);

  const songIds = await getAlbumSongIds(parsedAlbumId, trx);
  if (songIds.length === 0) {
    await deleteAlbum(parsedAlbumId, trx);
    isAlbumRemoved = true;
  }

  return { isAlbumRemoved };
};

export const removeDeletedGenreDataOfSong = async (song: SavableSongData, trx: DBTransaction) => {
  const isGenreRemoved = false;
  if (Array.isArray(song.genres) && song.genres.length > 0) {
    for (let i = 0; i < song.genres.length; i += 1) {
      const songGenre = song.genres[i];

      await unlinkSongFromGenre(Number(songGenre.genreId), Number(song.songId), trx);
    }
  }
  return { isGenreRemoved };
};

const removeSong = async (song: SavableSongData) => {
  logger.debug(`Started the deletion process of the song '${path.basename(song.path)}'`, {
    songId: song.songId,
    path: song.path
  });

  await db.transaction(async (trx) => {
    // Unlink the song from artists and albums first so we can check for empty entities
    await removeDeletedArtistDataOfSong(song, trx);
    await removeDeletedAlbumDataOfSong(song, trx);
    await removeDeletedGenreDataOfSong(song, trx);

    // Delete the song itself. The ON DELETE CASCADE will handle artworksSongs.
    await removeSongById(Number(song.songId), trx);
  });

  logger.debug(`'${path.basename(song.path)}' song removed from the library.`);
  return { song };
};

const removeSongsFromLibrary = async (
  songPaths: string[],
  abortSignal: AbortSignal
): PromiseFunctionReturn => {
  for (let i = 0; i < songPaths.length; i += 1) {
    const songPath = songPaths[i];

    if (abortSignal?.aborted) {
      logger.warn('Removing songs in the music folder aborted by an abortController signal.', {
        reason: abortSignal?.reason
      });
      break;
    }

    const song = await getSongByPath(songPath);
    if (song == null) continue;

    const songData = convertToSongData(song);

    const data = await removeSong(songData);
    if (!data) {
      return {
        success: false,
        message: `Error occurred when trying to remove the song '${path.basename(song.path)}' from the library.`
      };
    }

    sendMessageToRenderer({
      messageCode: 'SONG_REMOVE_PROCESS_UPDATE',
      data: { total: songPaths.length, value: i }
    });
  }

  dataUpdateEvent('songs/deletedSong');
  dataUpdateEvent('artists/deletedArtist');
  dataUpdateEvent('albums/deletedAlbum');
  dataUpdateEvent('genres/deletedGenre');
  dataUpdateEvent('playlists/deletedPlaylist');

  // Execute the garbage collection sweep once at the end of the batch removal.
  // This avoids running a sweep for every single song deleted.
  await sweepUnusedArtworks();

  return {
    success: true,
    message: `${songPaths.length} songs removed and updated artists, albums, playlists and genres related to them.`
  };
};

export default removeSongsFromLibrary;
