import { db } from '@db/db';
import { desc, eq } from 'drizzle-orm';

import { playHistory } from '../schema';

export const addSongToPlayHistory = async (songId: number, trx: DB | DBTransaction = db) => {
  const data = await trx.insert(playHistory).values({ songId });
  return data;
};

export const getSongPlayHistory = async (songId: number, trx: DB | DBTransaction = db) => {
  const data = await trx
    .select()
    .from(playHistory)
    .where(eq(playHistory.songId, songId))
    .orderBy(desc(playHistory.createdAt));

  return data;
};

import logger from '../../logger';
import { getAllSongs } from './songs';

export const getAllSongsInHistory = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  trx: DB | DBTransaction = db
) => {
  const { start = 0, end = 0 } = paginatingData || {};
  const limit = end - start === 0 ? undefined : end - start;

  try {
    // First, get the ordered song IDs from playHistory with pagination
    const historyRecords = await trx
      .select({ songId: playHistory.songId })
      .from(playHistory)
      .orderBy(desc(playHistory.createdAt))
      .limit(limit ?? 1000000)
      .offset(start);

    const songIds = historyRecords.map((r) => r.songId);

    if (songIds.length === 0) {
      return {
        data: [],
        sortType: sortType || 'addedOrder',
        filterType: 'notSelected',
        start,
        end
      };
    }

    // Then fetch the songs using the existing optimized getAllSongs query
    const songsResult = await getAllSongs(
      {
        start: 0, // We already paginated the IDs, so we fetch all matching songs
        end: 0,
        songIds,
        preserveIdOrder: true
      },
      trx
    );

    return {
      data: songsResult.data,
      sortType: sortType || 'addedOrder',
      filterType: 'notSelected',
      start,
      end
    };
  } catch (error) {
    logger.error('[MAIN] getAllSongsInHistory ERROR', { error });
    throw error;
  }
};

export const clearFullSongHistory = async (trx: DB | DBTransaction = db) => {
  const data = await trx.delete(playHistory);
  return data;
};
