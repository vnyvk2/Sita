import { createQueryKeys } from '@lukemorales/query-key-factory';
import { keepPreviousData } from '@tanstack/react-query';

import { SEARCH_LIMITS } from '../../../common/search/MatchTier';

export const ARTIST_SUMMARY_PAGE_SIZE = 120;

export interface ArtistSummariesParams {
  sortType: ArtistSortTypes;
  filterType?: ArtistFilterTypes;
  keyword?: string;
}

export const ARTIST_SUMMARIES_ROOT = ['artists', 'summaries'] as const;

export const artistSummariesQueryKey = (params: ArtistSummariesParams) =>
  [
    ...ARTIST_SUMMARIES_ROOT,
    `sortType=${params.sortType}`,
    `filterType=${params.filterType ?? 'notSelected'}`,
    `keyword=${params.keyword ?? ''}`
  ] as const;

const artistToSummary = (artist: Artist): ArtistSummary => ({
  artistId: artist.artistId,
  name: artist.name,
  isAFavorite: artist.isAFavorite ?? false,
  artworkPaths: artist.artworkPaths,
  onlineArtworkPaths: artist.onlineArtworkPaths,
  songCount: artist.songs?.length ?? 0
});

export const fetchArtistSummariesPage = async (
  params: ArtistSummariesParams,
  start: number
): Promise<PaginatedResult<ArtistSummary, ArtistSortTypes>> => {
  if (params.keyword?.trim()) {
    if (start > 0) return { data: [], total: 0, sortType: params.sortType, start, end: start };
    const res = await window.api.search.query({
      filter: 'Artists',
      keyword: params.keyword,
      limit: SEARCH_LIMITS.PAGE,
      updateSearchHistory: false
    });
    const artists =
      params.filterType === 'favorites'
        ? res.artists.filter((artist) => artist.isAFavorite)
        : res.artists;
    return {
      data: artists.map(artistToSummary),
      total: artists.length,
      sortType: params.sortType,
      start,
      end: start + artists.length
    };
  }
  return window.api.artistsData.getArtistSummaries(
    params.sortType,
    params.filterType,
    start,
    start + ARTIST_SUMMARY_PAGE_SIZE
  );
};

export const artistSummariesQuery = (params: ArtistSummariesParams & { start?: number }) => {
  const { start = 0 } = params;
  return {
    queryKey: [...artistSummariesQueryKey(params), `start=${start}`],
    queryFn: () => fetchArtistSummariesPage(params, start),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  };
};

export const artistQuery = createQueryKeys('artists', {
  all: (data: {
    sortType: ArtistSortTypes;
    filterType?: ArtistFilterTypes;
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
            filter: 'Artists',
            keyword,
            limit: SEARCH_LIMITS.PAGE,
            updateSearchHistory: false
          });
          return { data: res.artists, unresolvedData: [] };
        }
        return window.api.artistsData.getArtistData(
          [],
          sortType as ArtistSortTypes,
          filterType as ArtistFilterTypes,
          start,
          end
        );
      }
    };
  },
  single: (data: { artistId: number }) => {
    return {
      queryKey: [data.artistId],
      queryFn: () => window.api.artistsData.getArtistData([data.artistId])
    };
  },
  fetchOnlineInfo: (data: { artistId: number }) => {
    return {
      queryKey: [data.artistId],
      queryFn: async () => (await window.api.artistsData.getArtistArtworks(data.artistId)) ?? null
    };
  },
  discography: (data: { artistId: number; artistName: string }) => {
    return {
      queryKey: [data.artistId, data.artistName, 'discography'],
      queryFn: async () =>
        window.api.artistsData.getArtistDiscography(data.artistId, data.artistName)
    };
  },
  onlineAlbumTracks: (data: { onlineAlbumId: number; artistId: number }) => {
    return {
      queryKey: [data.artistId, data.onlineAlbumId, 'tracks'],
      queryFn: async () =>
        window.api.artistsData.getAlbumOnlineTracks(data.onlineAlbumId, data.artistId)
    };
  },
  onlineProfile: (data: { artistId: number; artistName: string }) => {
    return {
      queryKey: [data.artistId, data.artistName, 'profile'],
      queryFn: async () =>
        window.api.artistsData.getArtistOnlineProfile(data.artistId, data.artistName)
    };
  }
});

export const ARTIST_ONLINE_STALE_TIME = 1000 * 60 * 60 * 24;

export const artistMutations = {
  toggleLike: (data: { artistIds: number[]; isLikeArtist?: boolean }) => ({
    invalidatingQueryKeys: [['artists']],
    mutationFn: () => window.api.artistsData.toggleLikeArtists(data.artistIds, data.isLikeArtist)
  })
};
