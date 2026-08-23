import { addSongToPlayHistory } from '@main/db/queries/history';
import { getPlayableSongById } from '@main/db/queries/songs';
import { setDiscordRpcActivity } from '@main/other/discordRPC';
import {
  parseArtistOnlineArtworks,
  parseSongArtworks,
  resolveSongFilePath
} from '../fs/resolveFilePaths';
import logger from '../logger';
import { setCurrentSongPath } from '../main';
import { parsePaletteFromArtworks } from './getAllSongs';

const sendAudioData = async (
  songId: number,
  updateListeningRate = true
): Promise<AudioPlayerData> => {
  logger.verbose(`Fetching song data for song id -${songId}-`);
  try {
    const song = await getPlayableSongById(songId);

    if (song) {
      const artists: AudioPlayerData['artists'] =
        song.artists?.map((a) => ({
          artistId: a.artist.id,
          name: a.artist.name,
          onlineArtworkPaths: parseArtistOnlineArtworks(a.artist.artworks.map((aw) => aw.artwork))
        })) ?? [];

      const artworks = song.artworks.map((a) => a.artwork);
      const artworkPaths = parseSongArtworks(artworks);
      const songArtwork = artworkPaths.artworkPath;

      const albumObj = song.albums?.[0]?.album;
      const album = albumObj ? { albumId: albumObj.id, name: albumObj.title } : undefined;
      const isBlacklisted = song.isBlacklisted;
      const isAFavorite = song.isFavorite;

      const data: AudioPlayerData = {
        title: song.title,
        artists,
        duration: Number(song.duration),
        artworkPath: songArtwork,
        path: resolveSongFilePath(song.path),
        songId: song.id,
        isAFavorite,
        album,
        paletteData: parsePaletteFromArtworks(artworks),
        isKnownSource: true, // this is always true here because the song is from the library
        isBlacklisted
      };

      if (updateListeningRate) {
        addSongToPlayHistory(songId);

        const now = Date.now();
        setDiscordRpcActivity({
          details: `Listening to '${data.title}'`,
          state: `By ${data.artists?.map((artist) => artist.name).join(', ')}`,
          assets: {
            large_image: 'nora_logo',
            small_image: 'song_artwork'
          },
          timestamps: {
            start: now,
            end: now + data.duration * 1000
          }
        });
        setCurrentSongPath(song.path);
      }

      return data;
    }
    logger.error(`No matching song to send audio data`, { audioId: songId });
    throw new Error('SONG_NOT_FOUND' as ErrorCodes);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException)?.code === 'SONG_NOT_FOUND' ||
      (error as Error)?.message === 'SONG_NOT_FOUND'
    ) {
      throw error;
    }
    logger.error(`Failed to send songs data.`, { err: error });
    throw new Error('SONG_DATA_SEND_FAILED' as ErrorCodes);
  }
};

export default sendAudioData;
