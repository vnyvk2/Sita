import { db } from '@db/db';
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
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { and, asc, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';

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
    return (await trx.query.songs.findFirst({ where: eq(songs.id, songId) })) as typeof songs.$inferSelect;
  }

  const res = await trx
    .update(songs)
    .set(updatePayload)
    .where(eq(songs.id, songId))
    .returning();

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
}

const hasTruthyLanguageOverride = sql`EXISTS (
  SELECT 1 FROM ${metadataOverrides}
  WHERE ${metadataOverrides.entityKind} = 'song'
    AND ${metadataOverrides.fieldId} = 'language'
    AND ${metadataOverrides.entityId} = ${songs.id}::text
    AND ${metadataOverrides.stringValue} IS NOT NULL
    AND btrim(${metadataOverrides.stringValue}) <> ''
)`;

export const getFilteredSongLibraryIds = async (
  options: FilteredSongIdsOptions = {},
  trx: DB | DBTransaction = db
): Promise<{ ids: number[]; total: number }> => {
  const {
    sortType = 'aToZ',
    filterType = 'notSelected',
    language,
    genre,
    onlyFavoriteArtists,
    onlyFavoriteAlbums
  } = options;

  const filters: SQL[] = [];

  if (filterType === 'favorites' || filterType === 'nonFavorites') {
    filters.push(eq(songs.isFavorite, filterType === 'favorites'));
  }

  if (filterType === 'blacklistedSongs' || filterType === 'whitelistedSongs') {
    filters.push(eq(songs.isBlacklisted, filterType === 'blacklistedSongs'));
  }

  if (language && language !== 'all') {
    if (language === 'unspecified') {
      filters.push(
        sql`(NOT ${hasTruthyLanguageOverride} AND (${songs.language} IS NULL OR btrim(${songs.language}) = ''))`
      );
    } else {
      filters.push(sql`(
        (EXISTS (
          SELECT 1 FROM ${metadataOverrides}
          WHERE ${metadataOverrides.entityKind} = 'song'
            AND ${metadataOverrides.fieldId} = 'language'
            AND ${metadataOverrides.entityId} = ${songs.id}::text
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

  const query = trx.select({ id: songs.id }).from(songs);

  if (filters.length > 0) {
    query.where(and(...filters));
  }

  if (orderClauses.length > 0) {
    query.orderBy(...orderClauses);
  }

  const results = await query;
  const ids = results.map((r) => r.id);
  return { ids, total: ids.length };
};

export interface SongListFacets {
  languages: string[];
  genres: string[];
}

export const getSongListFacets = async (
  trx: DB | DBTransaction = db
): Promise<SongListFacets> => {
  const languagesResult = await trx.execute<{ val: string }>(sql`
    SELECT DISTINCT val FROM (
      SELECT language AS val FROM songs WHERE language IS NOT NULL AND btrim(language) <> ''
      UNION
      SELECT string_value AS val FROM ${metadataOverrides}
        WHERE ${metadataOverrides.entityKind} = 'song'
          AND ${metadataOverrides.fieldId} = 'language'
          AND ${metadataOverrides.stringValue} IS NOT NULL
          AND btrim(${metadataOverrides.stringValue}) <> ''
    ) t ORDER BY val ASC
  `);

  const genresResult = await trx
    .select({ name: genres.name })
    .from(genres)
    .where(sql`btrim(${genres.name}) <> ''`)
    .orderBy(asc(genres.name));

  return {
    languages: languagesResult.rows.map((r) => r.val.trim()).filter((v) => v.length > 0),
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
    where: or(ilike(songs.title, `%${keyword}%`)),
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
      }
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
