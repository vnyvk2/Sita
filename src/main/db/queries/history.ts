import { db } from '@db/db';
import { and, asc, desc, eq, gte, sql, type SQL } from 'drizzle-orm';

import logger from '../../logger';
import { rawAll } from '@db/sqlite/raw';
import { albums, albumsSongs, artists, artistsSongs, metadataOverrides, playHistory, songs } from '../schema';
import { getAllSongs } from './songs';

export type { HistoryQueryOptions, HistoryPeriod };

export interface HistorySongIdsParams {
  sortType?: SongSortTypes;
  period?: HistoryPeriod;
  limit?: number;
  language?: string;
}

export interface HistorySongIdsResult {
  entries: Array<{
    songId: number;
    playedAt?: number;
    playCount?: number;
  }>;
  ids: number[];
  total: number;
  totalDuration?: number;
  blacklistedIds: number[];
  languages: string[];
}

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

export const getHistorySongIds = async (
  options: HistorySongIdsParams = {},
  trx: DB | DBTransaction = db
): Promise<HistorySongIdsResult> => {
  const { sortType = 'addedOrder', period, limit, language } = options;

  const isMostPlayed = sortType === 'allTimeMostListened' || sortType === 'monthlyMostListened';
  const effectivePeriod = period ?? (sortType === 'monthlyMostListened' ? '30' : 'all');
  const cutoffDate = getCutoffDate(effectivePeriod);

  const filters: SQL[] = [];
  if (cutoffDate) {
    filters.push(gte(playHistory.createdAt, cutoffDate));
  }

  const hasTruthyLanguageOverride = sql`EXISTS (
    SELECT 1 FROM ${metadataOverrides}
    WHERE ${metadataOverrides.entityKind} = 'song'
      AND ${metadataOverrides.fieldId} = 'language'
      AND ${metadataOverrides.entityId} = ${songs.id}
      AND ${metadataOverrides.stringValue} IS NOT NULL
      AND trim(${metadataOverrides.stringValue}) <> ''
  )`;

  if (language && language !== 'all') {
    if (language === 'unspecified') {
      filters.push(
        sql`(NOT ${hasTruthyLanguageOverride} AND (${songs.language} IS NULL OR trim(${songs.language}) = ''))`
      );
    } else {
      const targetLang = language.toLowerCase();
      filters.push(sql`(
        (EXISTS (
          SELECT 1 FROM ${metadataOverrides}
          WHERE ${metadataOverrides.entityKind} = 'song'
            AND ${metadataOverrides.fieldId} = 'language'
            AND ${metadataOverrides.entityId} = ${songs.id}
            AND lower(${metadataOverrides.stringValue}) = ${targetLang}
        ))
        OR (
          NOT ${hasTruthyLanguageOverride}
          AND lower(${songs.language}) = ${targetLang}
        )
      )`);
    }
  }

  let orderClauses: SQL[] = [];
  if (isMostPlayed) {
    orderClauses = [
      sql`count(*) DESC`,
      sql`max(${playHistory.createdAt}) DESC`,
      asc(playHistory.songId)
    ];
  } else if (sortType === 'addedOrder' || sortType === 'dateAddedDescending' || !sortType) {
    orderClauses = [sql`max(${playHistory.createdAt}) DESC`];
  } else if (sortType === 'dateAddedAscending') {
    orderClauses = [sql`min(${playHistory.createdAt}) ASC`];
  } else if (sortType === 'aToZ') {
    orderClauses = [asc(songs.title), sql`max(${playHistory.createdAt}) DESC`];
  } else if (sortType === 'zToA') {
    orderClauses = [desc(songs.title), sql`max(${playHistory.createdAt}) DESC`];
  } else if (sortType === 'releasedYearAscending') {
    orderClauses = [asc(songs.year), asc(songs.title)];
  } else if (sortType === 'releasedYearDescending') {
    orderClauses = [desc(songs.year), asc(songs.title)];
  } else if (sortType === 'artistNameAscending') {
    orderClauses = [
      sql`(SELECT min(lower(${artists.name})) FROM ${artistsSongs} JOIN ${artists} ON ${artists.id} = ${artistsSongs.artistId} WHERE ${artistsSongs.songId} = ${songs.id}) ASC`,
      asc(songs.title)
    ];
  } else if (sortType === 'albumNameAscending') {
    orderClauses = [
      sql`(SELECT min(lower(${albums.title})) FROM ${albumsSongs} JOIN ${albums} ON ${albums.id} = ${albumsSongs.albumId} WHERE ${albumsSongs.songId} = ${songs.id}) ASC`,
      asc(songs.title)
    ];
  } else {
    orderClauses = [sql`max(${playHistory.createdAt}) DESC`];
  }

  const query = trx
    .select({
      songId: playHistory.songId,
      playCount: sql<number>`count(*)`,
      lastPlayed: sql<Date>`max(${playHistory.createdAt})`,
      firstPlayed: sql<Date>`min(${playHistory.createdAt})`,
      duration: songs.duration,
      isBlacklisted: songs.isBlacklisted
    })
    .from(playHistory)
    .innerJoin(songs, eq(playHistory.songId, songs.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .groupBy(playHistory.songId)
    .orderBy(...orderClauses);

  const topNLimit = isMostPlayed ? Math.min(Math.max(1, limit ?? 25), 1000) : limit;
  const rows = topNLimit ? await query.limit(topNLimit) : await query;

  // Languages query for distinct languages present in history within this period (including overrides)
  const langQuery = sql`
    SELECT DISTINCT val FROM (
      SELECT ${songs.language} AS val
      FROM ${playHistory}
      INNER JOIN ${songs} ON ${playHistory.songId} = ${songs.id}
      WHERE ${songs.language} IS NOT NULL AND trim(${songs.language}) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM ${metadataOverrides}
          WHERE ${metadataOverrides.entityKind} = 'song'
            AND ${metadataOverrides.fieldId} = 'language'
            AND ${metadataOverrides.entityId} = ${songs.id}
            AND ${metadataOverrides.stringValue} IS NOT NULL
            AND trim(${metadataOverrides.stringValue}) <> ''
        )
        ${cutoffDate ? sql`AND ${playHistory.createdAt} >= ${cutoffDate.getTime()}` : sql``}
      UNION
      SELECT ${metadataOverrides.stringValue} AS val
      FROM ${playHistory}
      INNER JOIN ${metadataOverrides} ON ${metadataOverrides.entityId} = cast(${playHistory.songId} as text)
        AND ${metadataOverrides.entityKind} = 'song'
        AND ${metadataOverrides.fieldId} = 'language'
      WHERE ${metadataOverrides.stringValue} IS NOT NULL
        AND trim(${metadataOverrides.stringValue}) <> ''
        ${cutoffDate ? sql`AND ${playHistory.createdAt} >= ${cutoffDate.getTime()}` : sql``}
    ) t ORDER BY val ASC
  `;
  const langRows = await rawAll<{ val: string }>(langQuery, trx);
  const languages = langRows
    .map((r) => r.val?.trim())
    .filter((l): l is string => Boolean(l));

  const entries: Array<{ songId: number; playedAt?: number; playCount?: number }> = [];
  const ids: number[] = [];
  const blacklistedIds: number[] = [];
  let totalDuration = 0;

  for (const row of rows) {
    const rawPlayed = sortType === 'dateAddedAscending' ? row.firstPlayed : row.lastPlayed;
    const playedAt = rawPlayed ? new Date(rawPlayed).getTime() : undefined;

    entries.push({
      songId: row.songId,
      playedAt,
      playCount: row.playCount
    });
    ids.push(row.songId);
    if (row.isBlacklisted) {
      blacklistedIds.push(row.songId);
    }
    totalDuration += Number(row.duration ?? 0);
  }

  return {
    entries,
    ids,
    total: entries.length,
    totalDuration,
    blacklistedIds,
    languages
  };
};
