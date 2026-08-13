import { getAllSongsInHistory, type HistoryQueryOptions } from '@main/db/queries/history';

import logger from '../logger';
import { convertToSongData } from '../utils/convert';

export const getAllHistorySongs = async (
  sortType?: SongSortTypes,
  paginatingData?: PaginatingData,
  options?: HistoryQueryOptions
): Promise<PaginatedResult<SongData, SongSortTypes>> => {
  try {
    const data = await getAllSongsInHistory(sortType, paginatingData, options);
    const songs = data.data.map((song) => convertToSongData(song));

    return {
      data: songs,
      sortType: sortType || 'addedOrder',
      end: paginatingData?.end || 0,
      start: paginatingData?.start || 0,
      total: songs.length
    };
  } catch (error) {
    logger.error('[MAIN] getAllHistorySongs ERROR', { error });
    throw error;
  }
};

