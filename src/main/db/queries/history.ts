import { db } from '@db/db';
import { asc, desc, eq, gte, sql } from 'drizzle-orm';

import logger from '../../logger';
import { playHistory } from '../schema';
import { getAllSongs } from './songs';

export type { HistoryQueryOptions, HistoryPeriod };

export const getCutoffDate = (period?: HistoryPeriod): Date | undefined => {
  if (!period || period === 'all') return undefined;
  const days = parseInt(period, 10);
  if (isNaN(days) || days <= 0) return undefined;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

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

export const getAllSongsInHistory = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  options?: HistoryQueryOptions,
  trx: DB | DBTransaction = db
) => {
  const { start = 0, end = 0 } = paginatingData || {};
  const limit = end - start > 0 ? end - start : undefined;

  try {
    const isMostPlayed = sortType === 'allTimeMostListened' || sortType === 'monthlyMostListened';

    const effectivePeriod = options?.period ?? (sortType === 'monthlyMostListened' ? '30' : 'all');
    const cutoffDate = getCutoffDate(effectivePeriod);
    const whereClause = cutoffDate ? gte(playHistory.createdAt, cutoffDate) : undefined;

    let songIds: number[] = [];
    let preserveOrder = true;

    if (isMostPlayed) {
      const topNLimit = Math.min(Math.max(1, options?.limit ?? 25), 1000);
      const historyRecords = await trx
        .select({
          songId: playHistory.songId,
          playCount: sql<number>`count(*)`,
          lastPlayed: sql<Date>`max(${playHistory.createdAt})`
        })
        .from(playHistory)
        .where(whereClause)
        .groupBy(playHistory.songId)
        .orderBy(
          sql`count(*) DESC`,
          sql`max(${playHistory.createdAt}) DESC`,
          asc(playHistory.songId)
        )
        .limit(topNLimit);

      const allTopSongIds = historyRecords.map((r) => r.songId);
      songIds = limit ? allTopSongIds.slice(start, start + limit) : allTopSongIds.slice(start);
      preserveOrder = true;
    } else if (sortType === 'addedOrder' || sortType === 'dateAddedDescending' || !sortType) {
      const historyRecords = await trx
        .select({
          songId: playHistory.songId,
          lastPlayed: sql<Date>`max(${playHistory.createdAt})`
        })
        .from(playHistory)
        .where(whereClause)
        .groupBy(playHistory.songId)
        .orderBy(sql`max(${playHistory.createdAt}) DESC`)
        .limit(limit ?? 1000000)
        .offset(start);

      songIds = historyRecords.map((r) => r.songId);
      preserveOrder = true;
    } else if (sortType === 'dateAddedAscending') {
      const historyRecords = await trx
        .select({
          songId: playHistory.songId,
          firstPlayed: sql<Date>`min(${playHistory.createdAt})`
        })
        .from(playHistory)
        .where(whereClause)
        .groupBy(playHistory.songId)
        .orderBy(sql`min(${playHistory.createdAt}) ASC`)
        .limit(limit ?? 1000000)
        .offset(start);

      songIds = historyRecords.map((r) => r.songId);
      preserveOrder = true;
    } else {
      const historyRecords = await trx
        .select({ songId: playHistory.songId })
        .from(playHistory)
        .where(whereClause)
        .groupBy(playHistory.songId);

      songIds = historyRecords.map((r) => r.songId);
      preserveOrder = false;
    }

    if (songIds.length === 0) {
      return {
        data: [],
        sortType: sortType || 'addedOrder',
        filterType: 'notSelected',
        start,
        end
      };
    }

    const songsResult = await getAllSongs(
      {
        start: 0,
        end: 0,
        songIds,
        sortType,
        preserveIdOrder: preserveOrder
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
