import { createQueryKeys } from '@lukemorales/query-key-factory';
import { SEARCH_LIMITS } from '../../../main/search/types/MatchTier';

export const artistQuery = createQueryKeys('artists', {
  all: (data: {
    sortType: ArtistSortTypes;
    filterType?: ArtistFilterTypes;
    start?: number;
    end?: number;
    limit?: number;
    keyword?: string;
  }) => {
    const { sortType = 'aToZ', filterType = 'notSelected', start = 0, end = 0, keyword = '' } = data;

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
      queryFn: () => window.api.artistsData.getArtistArtworks(data.artistId)
    };
  }
});

export const artistMutations = {
  toggleLike: (data: { artistIds: number[]; isLikeArtist?: boolean }) => ({
    invalidatingQueryKeys: [['artists']],
    mutationFn: () => window.api.artistsData.toggleLikeArtists(data.artistIds, data.isLikeArtist)
  })
};
