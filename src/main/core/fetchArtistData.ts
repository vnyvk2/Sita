import { getAllArtists } from '@main/db/queries/artists';

import logger from '../logger';
import { convertToArtist } from '../utils/convert';

const fetchArtistData = async (
  artistIdsOrNames: string[] = [],
  sortType?: ArtistSortTypes,
  filterType?: ArtistFilterTypes,
  start = 0,
  end = 0,
  limit = 0
): Promise<PaginatedResult<Artist, ArtistSortTypes>> => {
  const result: PaginatedResult<Artist, ArtistSortTypes> = {
    data: [],
    total: 0,
    sortType,
    start: 0,
    end: 0
  };

  logger.debug(`Requested artists data`, {
    artistIdsOrNamesCount: artistIdsOrNames.length,
    sortType,
    limit
  });

  const numericIds = artistIdsOrNames.map((id) => Number(id)).filter((id) => !isNaN(id));
  const stringNames = artistIdsOrNames.filter((item) => isNaN(Number(item)));

  // If specific artist IDs or names were requested but none valid exist in query, return empty result
  if (artistIdsOrNames.length > 0 && numericIds.length === 0 && stringNames.length === 0) {
    return result;
  }

  const artists = await getAllArtists({
    artistIds: numericIds,
    artistNames: stringNames,
    start,
    end,
    filterType,
    sortType
  });

  // If specific artists were requested but none matched in DB, return empty result instead of all artists
  if (
    artistIdsOrNames.length > 0 &&
    numericIds.length === 0 &&
    stringNames.length > 0 &&
    artists.data.length === 0
  ) {
    return result;
  }

  const results: Artist[] = artists.data.map((artist) => convertToArtist(artist));

  result.data = results;
  result.total = artists.data.length;
  result.start = artists.start;
  result.end = artists.end;

  return {
    data: results,
    total: result.total,
    start: result.start,
    end: result.end,
    sortType: result.sortType
  } satisfies PaginatedResult<Artist, ArtistSortTypes>;
};

export default fetchArtistData;
