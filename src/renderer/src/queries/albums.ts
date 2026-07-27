import { createQueryKeys } from '@lukemorales/query-key-factory';
import { SEARCH_LIMITS } from '../../../main/search/types/MatchTier';

export const albumQuery = createQueryKeys('albums', {
  all: (data: { sortType?: AlbumSortTypes; start?: number; end?: number; limit?: number; keyword?: string; }) => {
    const { sortType = 'aToZ', start = 0, end = 0, keyword = '' } = data;

    return {
      queryKey: [`sortType=${sortType}`, `start=${start}`, `end=${end}`, `limit=${end - start}`, `keyword=${keyword}`],
      queryFn: async () => {
        if (keyword.trim()) {
          const res = await window.api.search.query({
            filter: 'Albums',
            keyword,
            limit: SEARCH_LIMITS.PAGE,
            updateSearchHistory: false
          });
          return { data: res.albums, unresolvedData: [] };
        }
        return window.api.albumsData.getAlbumData([], sortType as AlbumSortTypes, start, end);
      }
    };
  },
  allAlbumInfo: (data: {
    albumIds: number[];
    sortType?: AlbumSortTypes;
    start?: number;
    end?: number;
  }) => {
    const { albumIds, sortType = 'aToZ', start = 0, end = 0 } = data;
    return {
      queryKey: [
        // Do NOT mutate the incoming array; copy before sort for cache key stability
        `albumIds=${[...albumIds].sort().join(',')}`,
        `sortType=${sortType}`,
        `start=${start}`,
        `end=${end}`,
        `limit=${end - start}`
      ],
      queryFn: () =>
        window.api.albumsData.getAlbumData(albumIds, sortType as AlbumSortTypes, start, end)
    };
  },
  single: (data: { albumId: number }) => ({
    queryKey: [data.albumId],
    queryFn: () => window.api.albumsData.getAlbumData([data.albumId], 'aToZ', 0, 1)
  }),
  fetchOnlineInfo: (data: { albumId: number }) => ({
    queryKey: [data.albumId],
    queryFn: () => window.api.albumsData.getAlbumInfoFromLastFM(data.albumId)
  })
});
