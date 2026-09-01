import { and, eq, isNull, like, sql } from 'drizzle-orm';

import { db } from '../db';
import { albums, albumsArtworks, albumsSongs, replayGain, songs, waveforms } from '../schema';

/**
 * Returns albums that do not have any artwork associated with them, along with one sample song path
 * to generate the artwork from.
 */
export const getAlbumsWithoutArtwork = async (limit = 1000) => {
  const result = await db
    .select({
      albumId: albums.id,
      albumTitle: albums.title,
      sampleSongPath: sql<string>`MAX(${songs.path})`
    })
    .from(albums)
    .leftJoin(albumsArtworks, eq(albums.id, albumsArtworks.albumId))
    .innerJoin(albumsSongs, eq(albums.id, albumsSongs.albumId))
    .innerJoin(songs, eq(albumsSongs.songId, songs.id))
    .where(isNull(albumsArtworks.artworkId))
    .groupBy(albums.id)
    .limit(limit);

  return result;
};

/**
 * Returns a bounded list of songs missing waveform data for supported audio formats. NOTE: WAV is
 * intentionally the only audio decoder implemented in the current milestone (WavAudioDecoder).
 * Using case-insensitive LIKE ensures .wav, .WAV, .Wav extensions are all matched in SQLite. When
 * additional streaming decoders (e.g. FLAC, MP3) are registered in AudioDecoderRegistry, this SQL
 * filter should be extended or removed.
 */
export const getSongsWithoutWaveform = async (limit = 500) => {
  return db
    .select({
      songId: songs.id,
      songPath: songs.path,
      songTitle: songs.title
    })
    .from(songs)
    .leftJoin(waveforms, eq(songs.id, waveforms.songId))
    .where(and(isNull(waveforms.id), like(songs.path, '%.wav')))
    .limit(limit);
};

/**
 * Returns a bounded list of songs missing ReplayGain loudness metrics for supported audio formats.
 * NOTE: WAV is intentionally the only audio decoder implemented in the current milestone
 * (WavAudioDecoder). Using case-insensitive LIKE ensures .wav, .WAV, .Wav extensions are all
 * matched in SQLite. When additional streaming decoders (e.g. FLAC, MP3) are registered in
 * AudioDecoderRegistry, this SQL filter should be extended or removed.
 */
export const getSongsWithoutReplayGain = async (limit = 500) => {
  return db
    .select({
      songId: songs.id,
      songPath: songs.path,
      songTitle: songs.title
    })
    .from(songs)
    .leftJoin(replayGain, eq(songs.id, replayGain.songId))
    .where(and(isNull(replayGain.id), like(songs.path, '%.wav')))
    .limit(limit);
};
