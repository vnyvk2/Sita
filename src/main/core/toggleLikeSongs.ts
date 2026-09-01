import { db } from '@main/db/db';
import { insertScrobble } from '@main/db/queries/scrobble_queue';
import { getUserSettings } from '@main/db/queries/settings';
import {
  getFlatSongsByIds,
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
import songMetadataCache from './songMetadataCache';

const fetchSongBasicInfo = async (
  ids: number[]
): Promise<Map<number, { title: string; artistNames: string }>> => {
  const map = new Map<number, { title: string; artistNames: string }>();
  if (ids.length === 0) return map;

  const missingIds: number[] = [];
  for (const id of ids) {
    const cached = songMetadataCache.get(id);
    if (cached) {
      const artistNames = cached.artists?.map((a) => a.name).join(', ') ?? '';
      map.set(id, { title: cached.title, artistNames });
    } else {
      missingIds.push(id);
    }
  }

  if (missingIds.length > 0) {
    try {
      const fetched = await getFlatSongsByIds(missingIds);
      for (const song of fetched) {
        const artistNames = song.artists?.map((a) => a.name).join(', ') ?? '';
        map.set(song.songId, { title: song.title, artistNames });
        songMetadataCache.set(song.songId, song);
      }
    } catch {
      // Fallback to getSongById for any still missing
      for (const id of missingIds) {
        if (!map.has(id)) {
          const raw = await getSongById(id).catch(() => null);
          if (raw) {
            const song = convertToSongData(raw);
            const artistNames = song.artists?.map((a) => a.name).join(', ') ?? '';
            map.set(id, { title: song.title, artistNames });
          }
        }
      }
    }
  }

  return map;
};

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

    const songInfoMap = await fetchSongBasicInfo([...likes, ...dislikes]);

    if (accountGen !== getCurrentListenBrainzGeneration()) {
      logger.info(
        'Discarding favorites sync: ListenBrainz account generation changed after querying songs'
      );
      return;
    }

    for (const songId of likes) {
      const song = songInfoMap.get(songId);
      if (song) {
        if (accountGen !== getCurrentListenBrainzGeneration()) return;
        await insertScrobble({
          songId,
          operationType: 'listenbrainz.love',
          trackTitle: song.title,
          artistNames: song.artistNames
        });
      }
    }

    for (const songId of dislikes) {
      const song = songInfoMap.get(songId);
      if (song) {
        if (accountGen !== getCurrentListenBrainzGeneration()) return;
        await insertScrobble({
          songId,
          operationType: 'listenbrainz.unlove',
          trackTitle: song.title,
          artistNames: song.artistNames
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

    const songInfoMap = await fetchSongBasicInfo([...likes, ...dislikes]);

    if (accountGen !== getCurrentLastFmGeneration()) {
      logger.info(
        'Discarding favorites sync: Last.fm account generation changed after querying songs'
      );
      return;
    }

    for (const songId of likes) {
      const song = songInfoMap.get(songId);
      if (song) {
        if (accountGen !== getCurrentLastFmGeneration()) return;
        await insertScrobble({
          songId,
          operationType: 'track.love',
          trackTitle: song.title,
          artistNames: song.artistNames
        });
      }
    }

    for (const songId of dislikes) {
      const song = songInfoMap.get(songId);
      if (song) {
        if (accountGen !== getCurrentLastFmGeneration()) return;
        await insertScrobble({
          songId,
          operationType: 'track.unlove',
          trackTitle: song.title,
          artistNames: song.artistNames
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

  // Synchronously update in-memory SongMetadataCache
  if (result.likes.length > 0) {
    songMetadataCache.updateFavoriteMany(result.likes, true);
  }
  if (result.dislikes.length > 0) {
    songMetadataCache.updateFavoriteMany(result.dislikes, false);
  }

  dataUpdateEvent('songs/likes', [...result.likes, ...result.dislikes]);

  if (result.likes.length > 0 || result.dislikes.length > 0) {
    enqueueFavoritesSync(result.likes, result.dislikes, lastFmGen, lbGen).catch((error) => {
      logger.error('Failed to sync favorites', { error });
    });
  }

  return result;
};

export default toggleLikeSongs;
