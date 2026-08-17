import { db } from '@main/db/db';
import { invertSongFavoriteStatuses, updateSongFavoriteStatuses } from '@main/db/queries/songs';

import logger from '../logger';
import { dataUpdateEvent } from '../main';

const toggleLikeSongs = async (songIds: number[], isLikeSong?: boolean) => {
  const result: ToggleLikeSongReturnValue = {
    likes: [],
    dislikes: []
  };

  logger.info(`Requested to like/dislike song(s).`, { songIds, isLikeSong });

  if (songIds.length === 0) {
    return result;
  }

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
  return result;
};

export default toggleLikeSongs;
