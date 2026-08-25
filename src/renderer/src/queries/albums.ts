import { createQueryKeys } from '@lukemorales/query-key-factory';
import { keepPreviousData } from '@tanstack/react-query';
import type { AlbumFilterTypes, AlbumSortTypes } from '@renderer/utils/albumFilters';
import { SEARCH_LIMITS } from '../../../common/search/MatchTier';

export const ALBUM_SUMMARY_PAGE_SIZE = 120;

export interface AlbumSummariesParams {
  sortType: AlbumSortTypes;
  filterType?: AlbumFilterTypes;
  keyword?: string;
}

export const ALBUM_SUMMARIES_ROOT = ['albums', 'summaries'] as const;

export const albumSummariesQueryKey = (params: AlbumSummariesParams) =>
  [
    ...ALBUM_SUMMARIES_ROOT,
    `sortType=${params.sortType}`,
    `filterType=${params.filterType ?? 'notSelected'}`,
    `keyword=${params.keyword ?? ''}`
  ] as const;

const albumToSummary = (album: Album): AlbumSummary => ({
  albumId: album.albumId,
  title: album.title,
  year: album.year,
  isAFavorite: album.isAFavorite ?? false,
  artists: album.artists ?? [],
  artworkPaths: album.artworkPaths,
  songCount: album.songs?.length ?? 0
});

export const fetchAlbumSummariesPage = async (
  params: AlbumSummariesParams,
  start: number
): Promise<PaginatedResult<AlbumSummary, AlbumSortTypes>> => {
  if (params.keyword?.trim()) {
    if (start > 0) return { data: [], total: 0, sortType: params.sortType, start, end: start };
    const res = await window.api.search.query({
      filter: 'Albums',
      keyword: params.keyword,
      limit: SEARCH_LIMITS.PAGE,
      updateSearchHistory: false
    });
    const albums = params.filterType === 'favorites'
      ? res.albums.filter((album) => album.isAFavorite)
      : res.albums;
    return {
      data: albums.map(albumToSummary),
      total: albums.length,
      sortType: params.sortType,
      start,
      end: start + albums.length
    };
  }
  return window.api.albumsData.getAlbumSummaries(
    params.sortType,
    params.filterType,
    start,
    start + ALBUM_SUMMARY_PAGE_SIZE
  );
};

export const albumSummariesQuery = (params: AlbumSummariesParams & { start?: number }) => {
  const { start = 0 } = params;
  return {
    queryKey: [...albumSummariesQueryKey(params), `start=${start}`],
    queryFn: () => fetchAlbumSummariesPage(params, start),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  };
};

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
