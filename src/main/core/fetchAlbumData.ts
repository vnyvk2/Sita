import { getAllAlbums } from '@main/db/queries/albums';

import logger from '../logger';
import { convertToAlbum } from '../utils/convert';

const fetchAlbumData = async (
  albumTitlesOrIds: string[] = [],
  sortType?: AlbumSortTypes,
  filterType?: AlbumFilterTypes,
  start = 0,
  end = 0
): Promise<PaginatedResult<Album, AlbumSortTypes>> => {
  const result: PaginatedResult<Album, AlbumSortTypes> = {
    data: [],
    total: 0,
    sortType,
    start: 0,
    end: 0
  };

  logger.debug(`Requested albums data`, {
    albumTitlesOrIdsCount: albumTitlesOrIds.length,
    sortType,
    filterType
  });

  const numericIds = albumTitlesOrIds.map((x) => Number(x)).filter((x) => !isNaN(x));

  if (albumTitlesOrIds.length > 0 && numericIds.length === 0) {
    return result;
  }

  const albums = await getAllAlbums({
    albumIds: numericIds,
    sortType,
    filterType,
    start,
    end
  });

  const output = albums.data.map((x) => convertToAlbum(x));

  result.data = output;
  result.total = albums.data.length;
  result.start = albums.start;
  result.end = albums.end;

  return result;
};

export default fetchAlbumData;
