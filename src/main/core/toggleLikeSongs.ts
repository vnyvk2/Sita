import { db } from '@main/db/db';
import { insertScrobble } from '@main/db/queries/scrobble_queue';
import { getUserSettings } from '@main/db/queries/settings';
import {
  getSongById,
  invertSongFavoriteStatuses,
  updateSongFavoriteStatuses
} from '@main/db/queries/songs';
import {
  flushScrobbleQueue,
  getCurrentLastFmGeneration
} from '@main/other/lastFm/flushScrobbleQueue';
import { getCurrentListenBrainzGeneration } from '@main/other/listenBrainz/listenBrainzSession';
import { convertToSongData } from '@main/utils/convert';

import logger from '../logger';
import { dataUpdateEvent } from '../main';

const syncFavoritesToListenBrainz = async (
  likes: number[],
  dislikes: number[],
  accountGen: number
) => {
  try {
    if (accountGen !== getCurrentListenBrainzGeneration()) {
      logger.info(
        'Discarding favorites sync: ListenBrainz account generation changed before execution',
        {
          actionGen: accountGen,
          currentGen: getCurrentListenBrainzGeneration()
        }
      );
      return;
    }

    const { sendSongFavoritesDataToListenBrainz } = await getUserSettings();
    if (!sendSongFavoritesDataToListenBrainz) {
      return;
    }

    if (accountGen !== getCurrentListenBrainzGeneration()) {
      logger.info(
        'Discarding favorites sync: ListenBrainz account generation changed after fetching settings'
      );
      return;
    }

    const [likeSongs, dislikeSongs] = await Promise.all([
      Promise.all(likes.map((id) => getSongById(id).catch(() => null))),
      Promise.all(dislikes.map((id) => getSongById(id).catch(() => null)))
    ]);

    if (accountGen !== getCurrentListenBrainzGeneration()) {
      logger.info(
        'Discarding favorites sync: ListenBrainz account generation changed after querying songs'
      );
      return;
    }

    for (const songData of likeSongs) {
      if (songData) {
        if (accountGen !== getCurrentListenBrainzGeneration()) return;
        const song = convertToSongData(songData);
        const artistNames = song.artists?.map((a) => a.name).join(', ');
        await insertScrobble({
          songId: songData.id,
          operationType: 'listenbrainz.love',
          trackTitle: song.title,
          artistNames
        });
      }
    }

    for (const songData of dislikeSongs) {
      if (songData) {
        if (accountGen !== getCurrentListenBrainzGeneration()) return;
        const song = convertToSongData(songData);
        const artistNames = song.artists?.map((a) => a.name).join(', ');
        await insertScrobble({
          songId: songData.id,
          operationType: 'listenbrainz.unlove',
          trackTitle: song.title,
          artistNames
        });
      }
    }

    if (accountGen !== getCurrentListenBrainzGeneration()) return;

    flushScrobbleQueue().catch((err) => {
      logger.warn('Failed to flush scrobble queue after updating ListenBrainz favorites', { err });
    });
  } catch (error) {
    logger.error('Error occurred in syncFavoritesToListenBrainz', { error });
  }
};

const syncFavoritesToLastFm = async (likes: number[], dislikes: number[], accountGen: number) => {
  try {
    if (accountGen !== getCurrentLastFmGeneration()) {
      logger.info(
        'Discarding favorites sync: Last.fm account generation changed before execution',
        {
          actionGen: accountGen,
          currentGen: getCurrentLastFmGeneration()
        }
      );
      return;
    }

    const { sendSongFavoritesDataToLastFM } = await getUserSettings();
    if (!sendSongFavoritesDataToLastFM) {
      return;
    }

    if (accountGen !== getCurrentLastFmGeneration()) {
      logger.info(
        'Discarding favorites sync: Last.fm account generation changed after fetching settings'
      );
      return;
    }

    const [likeSongs, dislikeSongs] = await Promise.all([
      Promise.all(likes.map((id) => getSongById(id).catch(() => null))),
      Promise.all(dislikes.map((id) => getSongById(id).catch(() => null)))
    ]);

    if (accountGen !== getCurrentLastFmGeneration()) {
      logger.info(
        'Discarding favorites sync: Last.fm account generation changed after querying songs'
      );
      return;
    }

    for (const songData of likeSongs) {
      if (songData) {
        if (accountGen !== getCurrentLastFmGeneration()) return;
        const song = convertToSongData(songData);
        const artistNames = song.artists?.map((a) => a.name).join(', ');
        await insertScrobble({
          songId: songData.id,
          operationType: 'track.love',
          trackTitle: song.title,
          artistNames
        });
      }
    }

    for (const songData of dislikeSongs) {
      if (songData) {
        if (accountGen !== getCurrentLastFmGeneration()) return;
        const song = convertToSongData(songData);
        const artistNames = song.artists?.map((a) => a.name).join(', ');
        await insertScrobble({
          songId: songData.id,
          operationType: 'track.unlove',
          trackTitle: song.title,
          artistNames
        });
      }
    }

    if (accountGen !== getCurrentLastFmGeneration()) return;

    flushScrobbleQueue().catch((err) => {
      logger.warn('Failed to flush scrobble queue after updating favorites', { err });
    });
  } catch (error) {
    logger.error('Error occurred in syncFavoritesToLastFm', { error });
  }
};

let favoritesSyncChain: Promise<void> = Promise.resolve();

export function enqueueFavoritesSync(
  likes: number[],
  dislikes: number[],
  lastFmGen: number = getCurrentLastFmGeneration(),
  lbGen: number = getCurrentListenBrainzGeneration()
): Promise<void> {
  const task = async () => {
    await Promise.all([
      syncFavoritesToLastFm(likes, dislikes, lastFmGen),
      syncFavoritesToListenBrainz(likes, dislikes, lbGen)
    ]);
  };
  favoritesSyncChain = favoritesSyncChain.then(task, task);
  return favoritesSyncChain;
}

const toggleLikeSongs = async (songIds: number[], isLikeSong?: boolean) => {
  const result: ToggleLikeSongReturnValue = {
    likes: [],
    dislikes: []
  };

  logger.info(`Requested to like/dislike song(s).`, { songIds, isLikeSong });

  if (songIds.length === 0) {
    return result;
  }

  const lastFmGen = getCurrentLastFmGeneration();
  const lbGen = getCurrentListenBrainzGeneration();

  await db.transaction(async (trx) => {
    if (isLikeSong !== undefined) {
      await updateSongFavoriteStatuses(songIds, isLikeSong, trx);
      if (isLikeSong) {
        result.likes.push(...songIds);
      } else {
        result.dislikes.push(...songIds);
      }
    } else {
      const uniqueSongIds = Array.from(new Set(songIds));
      const updatedStatuses = await invertSongFavoriteStatuses(uniqueSongIds, trx);

      for (const status of updatedStatuses) {
        if (status.isFavorite) {
          result.likes.push(status.id);
        } else {
          result.dislikes.push(status.id);
        }
      }
    }
  });

  dataUpdateEvent('songs/likes', [...result.likes, ...result.dislikes]);

  if (result.likes.length > 0 || result.dislikes.length > 0) {
    enqueueFavoritesSync(result.likes, result.dislikes, lastFmGen, lbGen).catch((error) => {
      logger.error('Failed to sync favorites', { error });
    });
  }

  return result;
};

export default toggleLikeSongs;
