import { createQueryKeys } from '@lukemorales/query-key-factory';
import type { AlbumFilterTypes, AlbumSortTypes } from '@renderer/utils/albumFilters';
import { SEARCH_LIMITS } from '../../../common/search/MatchTier';

export const albumQuery = createQueryKeys('albums', {
  all: (data: {
    sortType?: AlbumSortTypes;
    filterType?: AlbumFilterTypes;
    start?: number;
    end?: number;
    limit?: number;
    keyword?: string;
  }) => {
    const {
      sortType = 'aToZ',
      filterType = 'notSelected',
      start = 0,
      end = 0,
      keyword = ''
    } = data;

    return {
      queryKey: [
        `sortType=${sortType}`,
        `filterType=${filterType}`,
        `start=${start}`,
        `end=${end}`,
        `limit=${end - start}`,
        `keyword=${keyword}`
      ],
      queryFn: async () => {
        if (keyword.trim()) {
          const res = await window.api.search.query({
            filter: 'Albums',
            keyword,
            limit: SEARCH_LIMITS.PAGE,
            updateSearchHistory: false
          });
          const data =
            filterType === 'favorites'
              ? res.albums.filter((album) => album.isAFavorite)
              : res.albums;
          return { data, unresolvedData: [] };
        }
        return window.api.albumsData.getAlbumData(
          [],
          sortType as AlbumSortTypes,
          filterType as AlbumFilterTypes,
          start,
          end
        );
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
        window.api.albumsData.getAlbumData(albumIds, sortType as AlbumSortTypes, undefined, start, end)
    };
  },
  single: (data: { albumId: number }) => ({
    queryKey: [data.albumId],
    queryFn: () => window.api.albumsData.getAlbumData([data.albumId], 'aToZ', undefined, 0, 1)
  }),
  fetchOnlineInfo: (data: { albumId: number }) => ({
    queryKey: [data.albumId],
    queryFn: async () => (await window.api.albumsData.getAlbumInfoFromLastFM(data.albumId)) ?? null
  })
});

export const albumMutations = {
  toggleLike: (data: { albumIds: number[]; isLikeAlbum?: boolean }) => ({
    invalidatingQueryKeys: [['albums'], ['songs']],
    mutationFn: () => window.api.albumsData.toggleLikeAlbums(data.albumIds, data.isLikeAlbum)
  })
};
