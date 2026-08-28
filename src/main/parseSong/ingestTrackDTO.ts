import { linkArtworksToSong, saveArtworks } from '@main/db/queries/artworks';
import { isSongWithPathAvailable, saveSong } from '@main/db/queries/songs';
import type { albums, artists, genres, songs } from '@main/db/schema';
import type { ParsedTrackDTO } from '@main/workers/process/workerProtocol';

import { processArtworkFiles } from '../other/artworks';
import manageAlbumArtistOfParsedSong from './manageAlbumArtistOfParsedSong';
import manageAlbumsOfParsedSong from './manageAlbumsOfParsedSong';
import manageArtistsOfParsedSong from './manageArtistsOfParsedSong';
import manageGenresOfParsedSong from './manageGenresOfParsedSong';

export interface IngestedTrackResult {
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

/**
 * Ingests a single ParsedTrackDTO into the database within an existing Drizzle transaction.
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 * 1. Runs strictly in the Main process using the provided transaction handle (trx).
 * 2. If preprocessedArtwork is provided, NO filesystem/image decoding work occurs inside trx.
 * 3. Never instantiates a new database connection.
 */
export async function ingestTrackDTO(
  track: ParsedTrackDTO,
  trx: Parameters<Parameters<typeof import('@main/db/db').db.transaction>[0]>[0],
  preprocessedArtwork?: Awaited<ReturnType<typeof processArtworkFiles>>
): Promise<IngestedTrackResult | undefined> {
  const isAvailable = await isSongWithPathAvailable(track.songPath, trx);
  if (isAvailable) {
    return undefined;
  }

  const processedArtwork =
    preprocessedArtwork ?? (await processArtworkFiles('songs', track.rawPictureBytes));

  const songInfo: typeof songs.$inferInsert = {
    title: track.title,
    duration: track.duration,
    year: track.year,
    path: track.songPath,
    sampleRate: track.sampleRate,
    bitRate: track.bitRate,
    noOfChannels: track.noOfChannels,
    diskNumber: track.diskNumber,
    trackNumber: track.trackNumber,
    musicBrainzRecordingId: track.musicBrainzRecordingId,
    isrc: track.isrc,
    language: track.language,
    fileCreatedAt: track.fileCreatedAt instanceof Date ? track.fileCreatedAt : new Date(track.fileCreatedAt),
    fileModifiedAt: track.fileModifiedAt instanceof Date ? track.fileModifiedAt : new Date(track.fileModifiedAt),
    folderId: track.folderId
  };

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

  const { relevantAlbum, newAlbum } = await manageAlbumsOfParsedSong(
    {
      songId: songData.id,
      artworkId: artworkData && artworkData.length > 0 ? artworkData[0].id : undefined,
      songYear: songData.year,
      artists: track.artists,
      albumArtists: track.albumArtists,
      albumName: track.album
    },
    trx
  );

  const { newArtists, relevantArtists } = await manageArtistsOfParsedSong(
    {
      songId: songData.id,
      artworkId: artworkData?.[0]?.id,
      songArtists: track.artists
    },
    trx
  );

  const { newAlbumArtists, relevantAlbumArtists } = await manageAlbumArtistOfParsedSong(
    { albumArtists: track.albumArtists, albumId: relevantAlbum?.id },
    trx
  );

  const { newGenres, relevantGenres } = await manageGenresOfParsedSong(
    {
      songId: songData.id,
      artworkId: artworkData?.[0]?.id,
      songGenres: track.genres
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
}
