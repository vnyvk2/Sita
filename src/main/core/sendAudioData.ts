import { addSongToPlayHistory } from '@main/db/queries/history';
import { getPlayableSongById } from '@main/db/queries/songs';
import { setDiscordRpcActivity } from '@main/other/discordRPC';

import {
  parseArtistOnlineArtworks,
  parseSongArtworks,
  resolveSongFilePath
} from '../fs/resolveFilePaths';
import logger from '../logger';
import { IS_DEVELOPMENT, setCurrentSongPath } from '../main';
import { parsePaletteFromArtworks } from './getAllSongs';

export const parseArtworkDataForAudioPlayerData = (artworkData?: Buffer | Uint8Array) => {
  if (artworkData === undefined) return undefined;

  if (IS_DEVELOPMENT) return Buffer.from(artworkData).toString('base64');
  return artworkData;
};

// const getRelevantArtistData = (
//   songArtists?: {
//     artistId: string;
//     name: string;
//   }[]
// ) => {
//   const artists = getArtistsData();
//   const relevantArtists: {
//     artistId: string;
//     artworkName?: string;
//     name: string;
//     onlineArtworkPaths?: OnlineArtistArtworks;
//   }[] = [];

//   if (songArtists) {
//     for (const songArtist of songArtists) {
//       for (const artist of artists) {
//         if (artist.artistId === songArtist.artistId) {
//           if (!artist.onlineArtworkPaths)
//             getArtistInfoFromNet(artist.artistId).catch((error) =>
//               logger.warn('Failed to get artist info from net', { err: error })
//             );

//           const { artistId, name, artworkName, onlineArtworkPaths } = artist;

//           relevantArtists.push({
//             artistId,
//             name,
//             artworkName,
//             onlineArtworkPaths
//           });
//         }
//       }
//     }
//   }

//   return relevantArtists;
// };

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
        artwork: undefined,
        artworkPath: songArtwork,
        artworkPaths: artworkPaths,
        path: resolveSongFilePath(song.path),
        songId: song.id,
        isAFavorite,
        album,
        paletteData: parsePaletteFromArtworks(artworks),
        isKnownSource: true, // this is always true here because the song is from the library
        isBlacklisted,
        replayGain: song.replayGain
          ? {
              trackGain: song.replayGain.trackGain,
              trackPeak: song.replayGain.trackPeak,
              albumGain: song.replayGain.albumGain,
              albumPeak: song.replayGain.albumPeak
            }
          : undefined
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
