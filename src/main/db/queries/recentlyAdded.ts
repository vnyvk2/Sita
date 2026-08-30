import { db } from '@db/db';
import { gte, sql } from 'drizzle-orm';

import logger from '../../logger';
import { songs } from '../schema';
import { getAllSongs } from './songs';

export const getRecentlyAddedCutoffDate = (period?: RecentlyAddedPeriod): Date | undefined => {
  if (!period || period === 'all') return undefined;

  if (period === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  const matches = period.match(/^(\d+)[dh]$/);
  if (!matches) return undefined;

  const value = parseInt(matches[1], 10);
  if (isNaN(value) || value <= 0) return undefined;

  const isHours = period.endsWith('h');
  const ms = value * (isHours ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000);

  return new Date(Date.now() - ms);
};

export const getAllSongsInRecentlyAdded = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  options?: { period?: RecentlyAddedPeriod },
  trx: DB | DBTransaction = db
) => {
  const { start = 0, end = 0 } = paginatingData || {};

  try {
    const cutoffDate = getRecentlyAddedCutoffDate(options?.period ?? 'today');
    const whereClause = cutoffDate ? gte(songs.createdAt, cutoffDate) : undefined;

    const countResult = await trx
      .select({ count: sql<number>`count(*)` })
      .from(songs)
      .where(whereClause);

    const total = countResult[0].count;

    if (total === 0) {
      return {
        data: [],
        sortType: sortType || 'addedOrder',
        filterType: 'notSelected' as SongFilterTypes,
        start,
        end,
        total
      };
    }

    let songIds: number[] | undefined = undefined;

    if (whereClause) {
      const songsResult = await trx.select({ id: songs.id }).from(songs).where(whereClause);

      songIds = songsResult.map((s) => s.id);
    }

    const fullSongsResult = await getAllSongs(
      {
        start,
        end,
        songIds,
        sortType,
        preserveIdOrder: false
      },
      trx
    );

    return {
      data: fullSongsResult.data,
      sortType: sortType || 'addedOrder',
      filterType: 'notSelected' as SongFilterTypes,
      start,
      end,
      total
    };
  } catch (error) {
    logger.error('[MAIN] getAllSongsInRecentlyAdded ERROR', { error });
    throw error;
  }
};
