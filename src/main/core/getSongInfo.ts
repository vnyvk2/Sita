import { db } from '@main/db/db';
import { getFlatSongsByIds } from '@main/db/queries/songs';

import logger from '../logger';
import songMetadataCache from './songMetadataCache';

const getSongInfo = async (
  songIds: number[],
  sortType?: SongSortTypes,
  filterType?: SongFilterTypes,
  limit = songIds.length,
  preserveIdOrder = false,
  noBlacklistedSongs = false,
  trx: DB | DBTransaction = db
): Promise<SongData[]> => {
  logger.debug(`Fetching song data from getSongInfo`, {
    songIdsLength: songIds.length,
    sortType,
    filterType,
    limit,
    preserveIdOrder,
    noBlacklistedSongs
  });

  if (!songIds || songIds.length === 0) {
    logger.warn(`App made a request to get-song-info function with an empty array of song ids.`);
    return [];
  }

  const normalizedIds = songIds.map((id) => Number(id)).filter((id) => !isNaN(id));
  if (normalizedIds.length === 0) {
    return [];
  }

  // Check cache for requested IDs
  const { misses } = songMetadataCache.getMany(normalizedIds);

  // Fetch cache misses via high-performance flat SQL projection
  if (misses.length > 0) {
    const fetchedSongs = await getFlatSongsByIds(misses, false, trx);
    if (fetchedSongs.length > 0) {
      songMetadataCache.setMany(fetchedSongs);
    }
  }

  let results: SongData[] = [];

  // If preserveIdOrder is true or sortType is not explicitly specified, preserve the requested sequence
  if (preserveIdOrder || !sortType) {
    for (let i = 0; i < normalizedIds.length; i += 1) {
      const song = songMetadataCache.get(normalizedIds[i]);
      if (song) {
        results.push(song);
      }
    }
  } else {
    // Deduplicate and apply in-memory sorting
    const uniqueSongs = new Map<number, SongData>();
    for (let i = 0; i < normalizedIds.length; i += 1) {
      const song = songMetadataCache.get(normalizedIds[i]);
      if (song) uniqueSongs.set(song.songId, song);
    }
    results = Array.from(uniqueSongs.values());

    if (sortType === 'aToZ') {
      results.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortType === 'zToA') {
      results.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortType === 'releasedYearAscending') {
      results.sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'releasedYearDescending') {
      results.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'trackNoAscending') {
      results.sort((a, b) => (a.trackNo ?? 0) - (b.trackNo ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'trackNoDescending') {
      results.sort((a, b) => (b.trackNo ?? 0) - (a.trackNo ?? 0) || a.title.localeCompare(b.title));
    } else if (sortType === 'dateAddedAscending') {
      results.sort(
        (a, b) => (a.addedDate ?? 0) - (b.addedDate ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateAddedDescending') {
      results.sort(
        (a, b) => (b.addedDate ?? 0) - (a.addedDate ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateModifiedAscending') {
      results.sort(
        (a, b) => (a.modifiedDate ?? 0) - (b.modifiedDate ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'dateModifiedDescending') {
      results.sort(
        (a, b) => (b.modifiedDate ?? 0) - (a.modifiedDate ?? 0) || a.title.localeCompare(b.title)
      );
    } else if (sortType === 'addedOrder') {
      results.sort(
        (a, b) => (b.addedDate ?? 0) - (a.addedDate ?? 0) || a.title.localeCompare(b.title)
      );
    }
  }

  // Apply filtering
  if (filterType === 'favorites') {
    results = results.filter((s) => s.isAFavorite);
  } else if (filterType === 'nonFavorites') {
    results = results.filter((s) => !s.isAFavorite);
  } else if (filterType === 'blacklistedSongs') {
    results = results.filter((s) => s.isBlacklisted);
  } else if (filterType === 'whitelistedSongs') {
    results = results.filter((s) => !s.isBlacklisted);
  }

  if (noBlacklistedSongs) {
    results = results.filter((s) => !s.isBlacklisted);
  }

  if (limit !== undefined && limit > 0 && results.length > limit) {
    results = results.slice(0, limit);
  }

  return results;
};

export default getSongInfo;
