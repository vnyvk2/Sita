import { getAllSongsInRecentlyAdded } from '@main/db/queries/recentlyAdded';

import logger from '../logger';
import { convertToSongData } from '../utils/convert';

export const getAllRecentlyAddedSongs = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  options?: { period?: RecentlyAddedPeriod }
): Promise<PaginatedResult<SongData, SongSortTypes>> => {
  try {
    const data = await getAllSongsInRecentlyAdded(sortType, paginatingData, options);
    const songs = data.data.map((song) => convertToSongData(song));

    return {
      data: songs,
      sortType: sortType || 'addedOrder',
      end: paginatingData?.end || 0,
      start: paginatingData?.start || 0,
      total: data.total
    };
  } catch (error) {
    logger.error('[MAIN] getAllRecentlyAddedSongs ERROR', { error });
    throw error;
  }
};
