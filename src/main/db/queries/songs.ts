import { db, getEngine } from '@db/db';
import {
  albums,
  albumsSongs,
  artists,
  artistsSongs,
  genres,
  genresSongs,
  metadataOverrides,
  musicFolders,
  songs
} from '@db/schema';
import type { SqliteEngine } from '@db/sqlite/engine';
import { rawAll } from '@db/sqlite/raw';
import { parseSongArtworks } from '@main/fs/resolveFilePaths';
import logger from '@main/logger';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { and, asc, desc, eq, inArray, like, or, type SQL, sql } from 'drizzle-orm';

export interface RawFlatSongRow {
  id: number;
  title: string;
  duration: number | string;
  path: string;
  year: number | null;
  trackNo: number | null;
  discNo: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  noOfChannels: number | null;
  language: string | null;
  musicBrainzId: string | null;
  isAFavorite: number;
  isBlacklisted: number;
  createdAt: number | string | null;
  updatedAt: number | string | null;
  fileCreatedAt: number | string | null;
  fileModifiedAt: number | string | null;
  album_json: string | null;
  artists_json: string | null;
  artworks_json: string | null;
  language_override: string | null;
}

export const mapRawFlatRowToSongData = (row: RawFlatSongRow): SongData => {
  const created = row.createdAt
    ? typeof row.createdAt === 'number'
      ? row.createdAt
      : new Date(row.createdAt).getTime()
    : 0;

  const modified = row.updatedAt
    ? typeof row.updatedAt === 'number'
      ? row.updatedAt
      : new Date(row.updatedAt).getTime()
    : undefined;

  let artists: { artistId: number; name: string }[] = [];
  if (typeof row.artists_json === 'string' && row.artists_json.trim() !== '') {
    try {
      const parsed = JSON.parse(row.artists_json);
      if (Array.isArray(parsed)) {
        artists = parsed.filter(
          (a) => a && typeof a.artistId === 'number' && typeof a.name === 'string'
        );
      }
    } catch {
      // Ignore invalid json string
    }
  }

  let album: { albumId: number; name: string; isAFavorite?: boolean } | undefined = undefined;
  if (typeof row.album_json === 'string' && row.album_json.trim() !== '') {
    try {
      const parsed = JSON.parse(row.album_json);
      if (parsed && typeof parsed.albumId === 'number' && typeof parsed.name === 'string') {
        album = {
          albumId: parsed.albumId,
          name: parsed.name,
          isAFavorite: Boolean(parsed.isAFavorite)
        };
      }
    } catch {
      // Ignore invalid json string
    }
  }

  let artworkList: { path: string; isOptimized?: boolean }[] = [];
  if (typeof row.artworks_json === 'string' && row.artworks_json.trim() !== '') {
    try {
      const parsed = JSON.parse(row.artworks_json);
      if (Array.isArray(parsed)) {
        artworkList = parsed
          .filter((a) => a && typeof a.path === 'string')
          .map((a) => ({
            path: a.path,
            isOptimized: Boolean(a.isOptimized)
          }));
      }
    } catch {
      // Ignore invalid json string
    }
  }

  const artworkPaths = parseSongArtworks(artworkList);
  const isArtworkAvailable = artworkList.length > 0;

  const language =
    typeof row.language_override === 'string' && row.language_override.trim() !== ''
      ? row.language_override.trim()
      : typeof row.language === 'string' && row.language.trim() !== ''
        ? row.language.trim()
        : undefined;

  const musicBrainzId =
    typeof row.musicBrainzId === 'string' && row.musicBrainzId.trim() !== ''
      ? row.musicBrainzId.trim()
      : undefined;

  return {
    songId: Number(row.id),
    title: String(row.title ?? ''),
    duration: Number(row.duration ?? 0),
    path: String(row.path ?? ''),
    artists,
    album,
    albumArtists: [],
    genres: [],
    artworkPaths,
    isArtworkAvailable,
    isAFavorite: Boolean(row.isAFavorite),
    isBlacklisted: Boolean(row.isBlacklisted),
    addedDate: created,
    createdDate: created,
    modifiedDate: modified,
    year: row.year != null ? Number(row.year) : undefined,
    trackNo: row.trackNo != null ? Number(row.trackNo) : undefined,
    discNo: row.discNo != null ? Number(row.discNo) : undefined,
    bitrate: row.bitrate != null ? Number(row.bitrate) : undefined,
    sampleRate: row.sampleRate != null ? Number(row.sampleRate) : undefined,
    noOfChannels: row.noOfChannels != null ? Number(row.noOfChannels) : undefined,
    language,
    musicBrainzId,
    paletteData: undefined
  };
};

export const getFlatSongsByIds = async (
  songIds: number[],
  preserveIdOrder = false,
  trx?: DB | DBTransaction
): Promise<SongData[]> => {
  if (!songIds || songIds.length === 0) return [];

  const engine = (trx as { _engine?: SqliteEngine } | undefined)?._engine ?? getEngine();
  if (!engine) {
    logger.warn('[getFlatSongsByIds] No SQLite engine available, returning empty list');
    return [];
  }

  const CHUNK_SIZE = 500;
  const uniqueIds = Array.from(new Set(songIds));
  const rawRows: RawFlatSongRow[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const sqlText = `
      SELECT
        s.id,
        s.title,
        s.duration,
        s.path,
        s.year,
        s.track_number AS trackNo,
        s.disk_number AS discNo,
        s.bit_rate AS bitrate,
        s.sample_rate AS sampleRate,
        s.no_of_channels AS noOfChannels,
        s.language,
        s.music_brainz_recording_id AS musicBrainzId,
        s.is_favorite AS isAFavorite,
        s.is_blacklisted AS isBlacklisted,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt,
        s.file_created_at AS fileCreatedAt,
        s.file_modified_at AS fileModifiedAt,
        (
          SELECT json_object(
            'albumId', al.id,
            'name', al.title,
            'isAFavorite', CAST(al.is_favorite AS INTEGER)
          )
          FROM album_songs als
          JOIN albums al ON al.id = als.album_id
          WHERE als.song_id = s.id
          LIMIT 1
        ) AS album_json,
        (
          SELECT json_group_array(
            json_object('artistId', ar.id, 'name', ar.name)
          )
          FROM artists_songs asg
          JOIN artists ar ON ar.id = asg.artist_id
          WHERE asg.song_id = s.id
        ) AS artists_json,
        (
          SELECT json_group_array(
            json_object('id', art.id, 'path', art.path, 'isOptimized', art.is_optimized)
          )
          FROM artworks_songs arts
          JOIN artworks art ON art.id = arts.artwork_id
          WHERE arts.song_id = s.id
        ) AS artworks_json,
        (
          SELECT mo.string_value
          FROM metadata_overrides mo
          WHERE mo.entity_kind = 'song'
            AND mo.field_id = 'language'
            AND mo.entity_id = CAST(s.id AS TEXT)
            AND mo.string_value IS NOT NULL
            AND trim(mo.string_value) <> ''
          LIMIT 1
        ) AS language_override
      FROM songs s
      WHERE s.id IN (${placeholders});
    `;

    const rows = engine.all(sqlText, chunk) as unknown as RawFlatSongRow[];
    if (rows && rows.length > 0) {
      rawRows.push(...rows);
    }
  }

  const convertedSongs = rawRows.map(mapRawFlatRowToSongData);

  if (preserveIdOrder) {
    const songsById = new Map<number, SongData>();
    for (let i = 0; i < convertedSongs.length; i += 1) {
      songsById.set(convertedSongs[i].songId, convertedSongs[i]);
    }
    const orderedSongs: SongData[] = [];
    for (let i = 0; i < songIds.length; i += 1) {
      const s = songsById.get(songIds[i]);
      if (s) orderedSongs.push(s);
    }
    return orderedSongs;
  }

  return convertedSongs;
};

export const isSongWithPathAvailable = async (path: string, trx: DB | DBTransaction = db) => {
  const count = await trx.$count(songs, eq(songs.path, path));

  return count > 0;
};

export const saveSong = async (data: typeof songs.$inferInsert, trx: DB | DBTransaction = db) => {
  const res = await trx.insert(songs).values(data).returning();
  return res[0];
};

export interface UpdateSongBasicFieldsData {
  title?: string;
  year?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  diskNumber?: number | null;
  musicBrainzRecordingId?: string | null;
  isrc?: string | null;
}

export const updateSongBasicFields = async (
  songId: number,
  data: UpdateSongBasicFieldsData,
  trx: DB | DBTransaction = db
) => {
  const updatePayload: Record<string, unknown> = {};

  if (data.title !== undefined) {
    updatePayload.title = data.title;
  }
  if (data.year !== undefined) {
    updatePayload.year = data.year || null;
  }
  if (data.trackNumber !== undefined) {
    updatePayload.trackNumber = data.trackNumber || null;
  }
  const discNo = data.discNumber ?? data.diskNumber;
  if (discNo !== undefined) {
    updatePayload.diskNumber = discNo || null;
  }
  if (data.musicBrainzRecordingId !== undefined) {
    updatePayload.musicBrainzRecordingId = data.musicBrainzRecordingId || null;
  }
  if (data.isrc !== undefined) {
    updatePayload.isrc = data.isrc || null;
  }

  if (Object.keys(updatePayload).length === 0) {
    return (await trx.query.songs.findFirst({
      where: eq(songs.id, songId)
    })) as typeof songs.$inferSelect;
  }

  const res = await trx.update(songs).set(updatePayload).where(eq(songs.id, songId)).returning();

  return res[0];
};

export const getSongsRelativeToFolder = async (
  folderPathOrId: string | number,
  options = {
    skipBlacklistedFolders: false,
    skipBlacklistedSongs: false
  },
  trx: DB | DBTransaction = db
) => {
  const folder = await trx.query.musicFolders.findFirst({
    where:
      typeof folderPathOrId === 'string'
        ? eq(musicFolders.path, folderPathOrId)
        : eq(musicFolders.id, folderPathOrId),
    columns: { id: true, isBlacklisted: true },
    with: {
      songs: {
        columns: { id: true, path: true, isBlacklisted: true }
      }
    }
  });

  if (!folder) return [];

  // Check if folder is blacklisted
  if (options?.skipBlacklistedFolders && folder.isBlacklisted) return [];

  // Filter out blacklisted songs if needed
  if (options?.skipBlacklistedSongs) {
    return folder.songs.filter((song) => !song.isBlacklisted);
  }

  return folder.songs;
};

export async function getSongsInFolders(
  folderIds: number[],
  options?: {
    skipBlacklistedSongs?: boolean;
    skipBlacklistedFolders?: boolean;
  },
  trx: DB | DBTransaction = db
) {
  if (folderIds.length === 0) return [];

  let validFolderIds = folderIds;

  // Filter out blacklisted folders if needed
  if (options?.skipBlacklistedFolders) {
    const blacklistedFolders = await trx.query.musicFolders.findMany({
      where: and(inArray(musicFolders.id, folderIds), eq(musicFolders.isBlacklisted, true)),
      columns: { id: true }
    });

    validFolderIds = folderIds.filter((id) => !blacklistedFolders.some((bf) => bf.id === id));

    if (validFolderIds.length === 0) return [];
  }

  // Query the songs
  const result = await trx.query.songs.findMany({
    where: (s) =>
      and(
        inArray(s.folderId, validFolderIds),
        options?.skipBlacklistedSongs ? eq(s.isBlacklisted, false) : undefined
      )
  });

  return result;
}

export type GetAllSongsReturnType = Awaited<ReturnType<typeof getAllSongs>>['data'];
const defaultGetAllSongsOptions = {
  songIds: [] as number[],
  start: 0,
  end: 0,
  filterType: 'notSelected' as SongFilterTypes,
  sortType: 'aToZ' as SongSortTypes,
  preserveIdOrder: false
};
export type GetAllSongsOptions = Partial<typeof defaultGetAllSongsOptions>;

export const getAllSongs = async (
  options: GetAllSongsOptions = defaultGetAllSongsOptions,
  trx: DB | DBTransaction = db
) => {
  const {
    start = 0,
    end = 0,
    filterType = 'notSelected',
    sortType = 'aToZ',
    songIds = [],
    preserveIdOrder = false
  } = options;

  const limit = end - start === 0 ? undefined : end - start;

  const timer = timeStart();
  const CHUNK_SIZE = 500;

  const relationsConfig = {
    artists: {
      with: {
        artist: {
          columns: { id: true, name: true }
        }
      }
    },
    albums: {
      with: {
        album: {
          columns: { id: true, title: true, isFavorite: true },
          with: {
            artists: {
              with: {
                artist: {
                  columns: { id: true, name: true }
                }
              }
            }
          }
        }
      }
    },
    genres: {
      with: {
        genre: {
          columns: { id: true, name: true }
        }
      }
    },
    artworks: {
      with: {
        artwork: {
          columns: {
            id: true,
            path: true,
            isOptimized: true
          }
        }
      }
    }
  } as const;

  type SongQueryResult = Awaited<
    ReturnType<
      typeof trx.query.songs.findMany<{
        with: typeof relationsConfig;
      }>
    >
  >;
  let songsData: SongQueryResult = [];

  if (songIds && songIds.length > CHUNK_SIZE) {
    const uniqueSongIds = Array.from(new Set(songIds));
    for (let i = 0; i < uniqueSongIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueSongIds.slice(i, i + CHUNK_SIZE);
      const chunkResults = await trx.query.songs.findMany({
        where: (s) => {
          const filters: SQL[] = [inArray(s.id, chunk)];

          if (filterType === 'favorites' || filterType === 'nonFavorites') {
            filters.push(eq(s.isFavorite, filterType === 'favorites'));
          }

          if (filterType === 'blacklistedSongs' || filterType === 'whitelistedSongs') {
            filters.push(eq(s.isBlacklisted, filterType === 'blacklistedSongs'));
          }

          return and(...filters);
        },
        with: relationsConfig
      });
      songsData.push(...chunkResults);
    }
  } else {
    songsData = await trx.query.songs.findMany({
      where: (s) => {
        const filters: SQL[] = [];

        if (songIds && songIds.length > 0) {
          filters.push(inArray(s.id, songIds));
        }

        if (filterType === 'favorites' || filterType === 'nonFavorites') {
          filters.push(eq(s.isFavorite, filterType === 'favorites'));
        }

        if (filterType === 'blacklistedSongs' || filterType === 'whitelistedSongs') {
          filters.push(eq(s.isBlacklisted, filterType === 'blacklistedSongs'));
        }

        return filters.length > 0 ? and(...filters) : undefined;
      },
      with: relationsConfig,
      orderBy: (songs) => {
        if (sortType === 'aToZ') return [asc(songs.title)];
        if (sortType === 'zToA') return [desc(songs.title)];
        if (sortType === 'releasedYearAscending') return [asc(songs.year), asc(songs.title)];
        if (sortType === 'releasedYearDescending') return [desc(songs.year), asc(songs.title)];
        if (sortType === 'trackNoAscending') return [asc(songs.trackNumber), asc(songs.title)];
        if (sortType === 'trackNoDescending') return [desc(songs.trackNumber), asc(songs.title)];
        if (sortType === 'dateAddedAscending') return [asc(songs.createdAt), asc(songs.title)];
        if (sortType === 'dateAddedDescending') return [desc(songs.createdAt), asc(songs.title)];
        if (sortType === 'dateModifiedAscending')
          return [asc(songs.fileModifiedAt), asc(songs.title)];
        if (sortType === 'dateModifiedDescending')
          return [desc(songs.fileModifiedAt), asc(songs.title)];
        if (sortType === 'addedOrder') return [desc(songs.createdAt), asc(songs.title)];
        if (sortType === 'mostSkipped') return [desc(songs.skipCount), asc(songs.title)];
        if (sortType === 'leastSkipped') return [asc(songs.skipCount), asc(songs.title)];

        return [];
      },
      offset: start,
      limit: limit
    });
  }
  timeEnd(timer);

  // If preserveIdOrder is true, build an ID -> song map once, then reconstruct requested sequence in O(N) naturally preserving duplicate occurrences
  let sortedData = songsData;
  if (preserveIdOrder && songIds.length > 0) {
    const songsById = new Map<number, (typeof songsData)[0]>();
    for (let i = 0; i < songsData.length; i++) {
      songsById.set(songsData[i].id, songsData[i]);
    }
    const orderedData: typeof songsData = [];
    for (let i = 0; i < songIds.length; i++) {
      const song = songsById.get(songIds[i]);
      if (song) {
        orderedData.push(song);
      }
    }
    sortedData = orderedData;
    if (start > 0 || (limit !== undefined && limit > 0)) {
      sortedData = sortedData.slice(start, limit !== undefined ? start + limit : undefined);
    }
  } else if (songIds && songIds.length > CHUNK_SIZE) {
    // For chunked queries without preserveIdOrder, apply sortType and pagination in-memory
    if (sortType === 'aToZ') {
      sortedData.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortType === 'zToA') {
      sortedData.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortType === 'releasedYearAscending') {
      sortedData.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'releasedYearDescending') {
      sortedData.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'trackNoAscending') {
      sortedData.sort(
        (a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'trackNoDescending') {
      sortedData.sort(
        (a, b) => (b.trackNumber ?? 0) - (a.trackNumber ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateAddedAscending') {
      sortedData.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateAddedDescending') {
      sortedData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateModifiedAscending') {
      sortedData.sort(
        (a, b) =>
          new Date(a.fileModifiedAt).getTime() - new Date(b.fileModifiedAt).getTime() ||
          a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateModifiedDescending') {
      sortedData.sort(
        (a, b) =>
          new Date(b.fileModifiedAt).getTime() - new Date(a.fileModifiedAt).getTime() ||
          a.title.localeCompare(b.title)
      );
    } else if (sortType === 'addedOrder') {
      sortedData.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          a.title.localeCompare(b.title)
      );
    } else if (sortType === 'mostSkipped') {
      sortedData.sort(
        (a, b) => (b.skipCount ?? 0) - (a.skipCount ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'leastSkipped') {
      sortedData.sort(
        (a, b) => (a.skipCount ?? 0) - (b.skipCount ?? 0) || a.title.localeCompare(b.title)
      );
    }

    if (start > 0 || (limit !== undefined && limit > 0)) {
      sortedData = sortedData.slice(start, limit !== undefined ? start + limit : undefined);
    }
  }

  return {
    data: sortedData,
    sortType,
    filterType,
    start,
    end
  };
};

export const getAllSongIds = async (
  options: {
    sortType?: SongSortTypes;
    filterType?: SongFilterTypes;
  } = {},
  trx: DB | DBTransaction = db
): Promise<number[]> => {
  const { sortType = 'aToZ', filterType = 'notSelected' } = options;

  const filters: SQL[] = [];

  if (filterType === 'favorites' || filterType === 'nonFavorites') {
    filters.push(eq(songs.isFavorite, filterType === 'favorites'));
  }

  if (filterType === 'blacklistedSongs' || filterType === 'whitelistedSongs') {
    filters.push(eq(songs.isBlacklisted, filterType === 'blacklistedSongs'));
  }

  let orderClauses: SQL[] = [];
  if (sortType === 'aToZ') orderClauses = [asc(songs.title)];
  else if (sortType === 'zToA') orderClauses = [desc(songs.title)];
  else if (sortType === 'releasedYearAscending') orderClauses = [asc(songs.year), asc(songs.title)];
  else if (sortType === 'releasedYearDescending')
    orderClauses = [desc(songs.year), asc(songs.title)];
  else if (sortType === 'trackNoAscending')
    orderClauses = [asc(songs.trackNumber), asc(songs.title)];
  else if (sortType === 'trackNoDescending')
    orderClauses = [desc(songs.trackNumber), asc(songs.title)];
  else if (sortType === 'dateAddedAscending')
    orderClauses = [asc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'dateAddedDescending')
    orderClauses = [desc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'dateModifiedAscending')
    orderClauses = [asc(songs.fileModifiedAt), asc(songs.title)];
  else if (sortType === 'dateModifiedDescending')
    orderClauses = [desc(songs.fileModifiedAt), asc(songs.title)];
  else if (sortType === 'addedOrder') orderClauses = [desc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'mostSkipped') orderClauses = [desc(songs.skipCount), asc(songs.title)];
  else if (sortType === 'leastSkipped') orderClauses = [asc(songs.skipCount), asc(songs.title)];

  const query = trx.select({ id: songs.id }).from(songs);

  if (filters.length > 0) {
    query.where(and(...filters));
  }

  if (orderClauses.length > 0) {
    query.orderBy(...orderClauses);
  }

  const results = await query;
  return results.map((r) => r.id);
};

export interface FilteredSongIdsOptions {
  sortType?: SongSortTypes;
  filterType?: SongFilterTypes;
  language?: string;
  genre?: string;
  onlyFavoriteArtists?: boolean;
  onlyFavoriteAlbums?: boolean;
  restrictToIds?: number[];
}

const hasTruthyLanguageOverride = sql`EXISTS (
  SELECT 1 FROM ${metadataOverrides}
  WHERE ${metadataOverrides.entityKind} = 'song'
    AND ${metadataOverrides.fieldId} = 'language'
    AND ${metadataOverrides.entityId} = ${songs.id}
    AND ${metadataOverrides.stringValue} IS NOT NULL
    AND trim(${metadataOverrides.stringValue}) <> ''
)`;

export const getFilteredSongLibraryIds = async (
  options: FilteredSongIdsOptions = {},
  trx: DB | DBTransaction = db
): Promise<{ ids: number[]; total: number; blacklistedIds: number[] }> => {
  const {
    sortType = 'aToZ',
    filterType = 'notSelected',
    language,
    genre,
    onlyFavoriteArtists,
    onlyFavoriteAlbums,
    restrictToIds
  } = options;

  const filters: SQL[] = [];

  if (restrictToIds && restrictToIds.length > 0) {
    const CHUNK = 500;
    const idClauses: SQL[] = [];
    for (let i = 0; i < restrictToIds.length; i += CHUNK) {
      idClauses.push(inArray(songs.id, restrictToIds.slice(i, i + CHUNK)));
    }
    if (idClauses.length === 1) filters.push(idClauses[0]);
    else {
      const combined = or(...idClauses);
      if (combined) filters.push(combined);
    }
  }

  if (filterType === 'favorites' || filterType === 'nonFavorites') {
    filters.push(eq(songs.isFavorite, filterType === 'favorites'));
  }

  if (filterType === 'blacklistedSongs' || filterType === 'whitelistedSongs') {
    filters.push(eq(songs.isBlacklisted, filterType === 'blacklistedSongs'));
  }

  if (language && language !== 'all') {
    if (language === 'unspecified') {
      filters.push(
        sql`(NOT ${hasTruthyLanguageOverride} AND (${songs.language} IS NULL OR trim(${songs.language}) = ''))`
      );
    } else {
      filters.push(sql`(
        (EXISTS (
          SELECT 1 FROM ${metadataOverrides}
          WHERE ${metadataOverrides.entityKind} = 'song'
            AND ${metadataOverrides.fieldId} = 'language'
            AND ${metadataOverrides.entityId} = ${songs.id}
            AND lower(${metadataOverrides.stringValue}) = lower(${language})
        ))
        OR (
          NOT ${hasTruthyLanguageOverride}
          AND lower(${songs.language}) = lower(${language})
        )
      )`);
    }
  }

  if (genre && genre !== 'all') {
    filters.push(sql`EXISTS (
      SELECT 1 FROM ${genresSongs}
      INNER JOIN ${genres} ON ${genres.id} = ${genresSongs.genreId}
      WHERE ${genresSongs.songId} = ${songs.id}
        AND lower(${genres.name}) = lower(${genre})
    )`);
  }

  if (onlyFavoriteArtists) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM ${artistsSongs}
      INNER JOIN ${artists} ON ${artists.id} = ${artistsSongs.artistId}
      WHERE ${artistsSongs.songId} = ${songs.id}
        AND ${artists.isFavorite} = TRUE
    )`);
  }

  if (onlyFavoriteAlbums) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM ${albumsSongs}
      INNER JOIN ${albums} ON ${albums.id} = ${albumsSongs.albumId}
      WHERE ${albumsSongs.songId} = ${songs.id}
        AND ${albums.isFavorite} = TRUE
    )`);
  }

  let orderClauses: SQL[] = [];
  if (sortType === 'aToZ') orderClauses = [asc(songs.title)];
  else if (sortType === 'zToA') orderClauses = [desc(songs.title)];
  else if (sortType === 'releasedYearAscending') orderClauses = [asc(songs.year), asc(songs.title)];
  else if (sortType === 'releasedYearDescending')
    orderClauses = [desc(songs.year), asc(songs.title)];
  else if (sortType === 'trackNoAscending')
    orderClauses = [asc(songs.trackNumber), asc(songs.title)];
  else if (sortType === 'trackNoDescending')
    orderClauses = [desc(songs.trackNumber), asc(songs.title)];
  else if (sortType === 'dateAddedAscending')
    orderClauses = [asc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'dateAddedDescending')
    orderClauses = [desc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'dateModifiedAscending')
    orderClauses = [asc(songs.fileModifiedAt), asc(songs.title)];
  else if (sortType === 'dateModifiedDescending')
    orderClauses = [desc(songs.fileModifiedAt), asc(songs.title)];
  else if (sortType === 'addedOrder') orderClauses = [desc(songs.createdAt), asc(songs.title)];
  else if (sortType === 'mostSkipped') orderClauses = [desc(songs.skipCount), asc(songs.title)];
  else if (sortType === 'leastSkipped') orderClauses = [asc(songs.skipCount), asc(songs.title)];

  const query = trx.select({ id: songs.id, isBlacklisted: songs.isBlacklisted }).from(songs);

  if (filters.length > 0) {
    query.where(and(...filters));
  }

  if (orderClauses.length > 0) {
    query.orderBy(...orderClauses, asc(songs.id));
  } else {
    query.orderBy(asc(songs.id));
  }

  if (process.env.NORA_DEBUG_IDS === '1') {
    try {
      const sqlPreview = query.toSQL();
      const { default: logger } = await import('@main/logger');
      logger.debug('[B-ids] getFilteredSongLibraryIds SQL preview', {
        sql: sqlPreview.sql.substring(0, 800),
        params: sqlPreview.params?.slice(0, 5),
        filters: filters.length,
        orderClauses: orderClauses.length,
        options
      });
    } catch {
      // Debug preview failure
    }
  }

  const results = await query;
  if (process.env.NORA_DEBUG_IDS === '1') {
    try {
      const { default: logger } = await import('@main/logger');
      logger.debug('[B-ids] getFilteredSongLibraryIds result', {
        count: results.length,
        firstIds: results.slice(0, 3).map((r) => r.id),
        options
      });
    } catch {
      // Debug preview failure
    }
  }
  const ids: number[] = [];
  const blacklistedIds: number[] = [];
  for (const row of results) {
    ids.push(row.id);
    if (row.isBlacklisted) blacklistedIds.push(row.id);
  }
  return { ids, total: ids.length, blacklistedIds };
};

export interface SongListFacets {
  languages: string[];
  genres: string[];
}

export const getSongListFacets = async (trx: DB | DBTransaction = db): Promise<SongListFacets> => {
  // rawAll: object rows (drizzle proxy .all() returns positional arrays for raw SQL)
  const languagesResult = await rawAll<{ val: string }>(sql`
    SELECT DISTINCT val FROM (
      SELECT language AS val FROM songs WHERE language IS NOT NULL AND trim(language) <> ''
      UNION
      SELECT string_value AS val FROM ${metadataOverrides}
        WHERE ${metadataOverrides.entityKind} = 'song'
          AND ${metadataOverrides.fieldId} = 'language'
          AND ${metadataOverrides.stringValue} IS NOT NULL
          AND trim(${metadataOverrides.stringValue}) <> ''
    ) t ORDER BY val ASC
  `);

  const genresResult = await trx
    .select({ name: genres.name })
    .from(genres)
    .where(sql`trim(${genres.name}) <> ''`)
    .orderBy(asc(genres.name));

  return {
    languages: languagesResult.map((r) => r.val.trim()).filter((v) => v.length > 0),
    genres: genresResult.map((r) => r.name.trim()).filter((v) => v.length > 0)
  };
};

export const getSongDurationsByIds = async (
  songIds: number[],
  trx: DB | DBTransaction = db
): Promise<{ id: number; duration: number }[]> => {
  if (!songIds || songIds.length === 0) return [];
  const CHUNK_SIZE = 500;
  const uniqueIds = Array.from(new Set(songIds));
  const results: { id: number; duration: number }[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const rows = await trx
      .select({ id: songs.id, duration: songs.duration })
      .from(songs)
      .where(inArray(songs.id, chunk));
    for (const row of rows) {
      results.push({ id: row.id, duration: Number(row.duration) });
    }
  }
  return results;
};

export type GetNonNullSongReturnType = NonNullable<Awaited<ReturnType<typeof getSongById>>>;
export const getSongById = async (songId: number, trx: DB | DBTransaction = db) => {
  const song = await trx.query.songs.findFirst({
    where: eq(songs.id, songId),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    }
  });
  return song;
};

export const getSongsByIds = async (songIds: number[], trx: DB | DBTransaction = db) => {
  if (!songIds || songIds.length === 0) return [];
  const results = await trx.query.songs.findMany({
    where: inArray(songs.id, songIds),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    }
  });
  return results;
};

export const getSongByPath = async (path: string, trx: DB | DBTransaction = db) => {
  const song = await trx.query.songs.findFirst({
    where: eq(songs.path, path),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    }
  });
  return song;
};

export const updateSongByPath = async (
  path: string,
  song: Partial<typeof songs.$inferInsert>,
  trx: DB | DBTransaction = db
) => {
  const updatedSong = await trx.update(songs).set(song).where(eq(songs.path, path)).returning();
  return updatedSong;
};

export const searchSongs = async (keyword: string, trx: DB | DBTransaction = db) => {
  const data = await trx.query.songs.findMany({
    where: or(like(songs.title, `%${keyword}%`)),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    }
  });
  return data;
};

export const getSongsByNames = async (songNames: string[], trx: DB | DBTransaction = db) => {
  if (songNames.length === 0) return [];

  const data = await trx.query.songs.findMany({
    where: inArray(songs.title, songNames),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    }
  });
  return data;
};

export const getSongFavoriteStatuses = async (songIds: number[], trx: DB | DBTransaction = db) => {
  const data = await trx
    .select({ id: songs.id, isFavorite: songs.isFavorite })
    .from(songs)
    .where(inArray(songs.id, songIds));
  return data;
};

export const updateSongFavoriteStatuses = async (
  songIds: number[],
  isFavorite: boolean,
  trx: DB | DBTransaction = db
) => {
  const data = await trx
    .update(songs)
    .set({ isFavorite, isFavoriteUpdatedAt: new Date() })
    .where(inArray(songs.id, songIds));
  return data;
};

export const invertSongFavoriteStatuses = async (
  songIds: number[],
  trx: DB | DBTransaction = db
) => {
  if (songIds.length === 0) return [];
  const data = await trx
    .update(songs)
    .set({
      isFavorite: sql`NOT ${songs.isFavorite}`,
      isFavoriteUpdatedAt: new Date()
    })
    .where(inArray(songs.id, songIds))
    .returning({ id: songs.id, isFavorite: songs.isFavorite });
  return data;
};

export const getPlayableSongById = async (songId: number, trx: DB | DBTransaction = db) => {
  const song = await trx.query.songs.findFirst({
    where: eq(songs.id, songId),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true },
            with: {
              artworks: {
                with: {
                  artwork: true
                }
              }
            }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      replayGain: true
    }
  });
  return song;
};

export const getSongsInPathList = async (songPaths: string[], trx: DB | DBTransaction = db) => {
  if (songPaths.length === 0) return [];

  const data = await trx.query.songs.findMany({
    where: inArray(songs.path, songPaths),
    columns: { id: true, path: true }
  });
  return data;
};

export const getAllSongsInFavorite = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  trx: DB | DBTransaction = db
) => {
  const { start = 0, end = 0 } = paginatingData || {};

  const limit = end - start === 0 ? undefined : end - start;

  const data = await trx.query.songs.findMany({
    where: (songs) => eq(songs.isFavorite, true),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true }
                  }
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      },
      playlists: {
        with: {
          playlist: {
            columns: { id: true, name: true }
          }
        }
      }
    },
    orderBy: (songs) => {
      const orders: SQL[] = [desc(songs.isFavoriteUpdatedAt)];
      // Apply sorting based on sortType parameter
      if (sortType === 'aToZ') return [asc(songs.title), ...orders];
      if (sortType === 'zToA') return [desc(songs.title), ...orders];
      if (sortType === 'releasedYearAscending')
        return [asc(songs.year), asc(songs.title), ...orders];
      if (sortType === 'releasedYearDescending')
        return [desc(songs.year), asc(songs.title), ...orders];
      if (sortType === 'trackNoAscending')
        return [asc(songs.trackNumber), asc(songs.title), ...orders];
      if (sortType === 'trackNoDescending')
        return [desc(songs.trackNumber), asc(songs.title), ...orders];
      if (sortType === 'dateAddedAscending')
        return [asc(songs.createdAt), asc(songs.title), ...orders];
      if (sortType === 'dateAddedDescending')
        return [desc(songs.createdAt), asc(songs.title), ...orders];
      if (sortType === 'dateModifiedAscending')
        return [asc(songs.fileModifiedAt), asc(songs.title), ...orders];
      if (sortType === 'dateModifiedDescending')
        return [desc(songs.fileModifiedAt), asc(songs.title), ...orders];
      if (sortType === 'addedOrder') return orders;
      if (sortType === 'mostSkipped') return [desc(songs.skipCount), asc(songs.title), ...orders];
      if (sortType === 'leastSkipped') return [asc(songs.skipCount), asc(songs.title), ...orders];
      return orders; // Default sorting
    },
    limit: limit,
    offset: start
  });

  return {
    data,
    sortType,
    filterType: 'notSelected',
    start,
    end
  };
};

export const getSongArtworksBySongIds = async (songIds: number[], trx: DB | DBTransaction = db) => {
  if (songIds.length === 0) return [];

  const data = await trx.query.songs.findMany({
    where: inArray(songs.id, songIds),
    columns: {
      id: true
    },
    with: {
      artworks: {
        with: {
          artwork: true
        }
      }
    }
  });
  return data;
};

export const getSongIdFromSongPath = async (path: string, trx: DB | DBTransaction = db) => {
  const song = await trx.query.songs.findFirst({
    where: eq(songs.path, path),
    columns: { id: true }
  });
  return song?.id ?? null;
};

export const getSongByIdForSongMetadata = async (songId: number, trx: DB | DBTransaction = db) => {
  const song = await trx.query.songs.findFirst({
    where: eq(songs.id, songId),
    with: {
      artists: {
        with: {
          artist: {
            columns: { id: true, name: true },
            with: {
              artworks: {
                with: {
                  artwork: true
                }
              }
            }
          }
        }
      },
      albums: {
        with: {
          album: {
            columns: { id: true, title: true, isFavorite: true },
            with: {
              artists: {
                with: {
                  artist: {
                    columns: { id: true, name: true },
                    with: {
                      artworks: {
                        with: {
                          artwork: true
                        }
                      }
                    }
                  }
                }
              },
              artworks: {
                with: {
                  artwork: true
                }
              }
            }
          }
        }
      },
      genres: {
        with: {
          genre: {
            columns: { id: true, name: true },
            with: {
              artworks: {
                with: {
                  artwork: true
                }
              }
            }
          }
        }
      },
      artworks: {
        with: {
          artwork: {
            with: {
              palette: {
                columns: { id: true },
                with: {
                  swatches: {}
                }
              }
            }
          }
        }
      }
    }
  });
  return song;
};

export const removeSongById = async (songId: number, trx: DB | DBTransaction = db) => {
  await trx.delete(songs).where(eq(songs.id, songId));
};

export const updateSongModifiedAtByPath = async (
  songPath: string,
  modifiedAt: Date,
  trx: DB | DBTransaction = db
) => {
  await trx.update(songs).set({ fileModifiedAt: modifiedAt }).where(eq(songs.path, songPath));
};
