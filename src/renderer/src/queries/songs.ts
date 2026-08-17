import { createQueryKeys } from '@lukemorales/query-key-factory';

import { SEARCH_LIMITS } from '../../../common/search/MatchTier';

export const songQuery = createQueryKeys('songs', {
  all: (data: {
    sortType: SongSortTypes;
    filterType?: SongFilterTypes;
    start?: number;
    end?: number;
    limit?: number;
    keyword?: string;
  }) => {
    const {
      sortType = 'addedOrder',
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
            filter: 'Songs',
            keyword,
            limit: SEARCH_LIMITS.PAGE,
            updateSearchHistory: false
          });
          return { data: res.songs, unresolvedData: [] };
        }
        return window.api.audioLibraryControls.getAllSongs(sortType, filterType, {
          start,
          end: end
        });
      }
    };
  },
  allSongInfo: (data: {
    songIds: number[];
    sortType: SongSortTypes;
    filterType?: SongFilterTypes;
  }) => {
    const { songIds, sortType, filterType } = data;
    return {
      queryKey: [
        // Do NOT mutate the incoming array; copy before sort for cache key stability
        `songIds=${[...songIds].sort().join(',')}`,
        `sortType=${sortType}`,
        `filterType=${filterType}`
      ],
      queryFn: () => window.api.audioLibraryControls.getSongInfo(songIds, sortType, filterType)
    };
  },
  singleSongInfo: (data: { songId: number }) => {
    return {
      queryKey: [data.songId],
      queryFn: () => window.api.audioLibraryControls.getSongInfo([data.songId])
    };
  },
  similarTracks: (data: { songId: number }) => {
    return {
      queryKey: [data.songId],
      queryFn: async () => {
        const res = await window.api.audioLibraryControls.getSimilarTracksForASong(data.songId);
        return res ?? { sortedAvailTracks: [], sortedUnAvailTracks: [] };
      }
    };
  },
  queue: (data: { songIds: number[]; queueId?: string; membershipVersion?: number } | number[]) => {
    const songIds = Array.isArray(data) ? data : data.songIds;
    const queueId = Array.isArray(data) ? 'active' : (data.queueId ?? 'active');
    const membershipVersion = Array.isArray(data) ? 0 : (data.membershipVersion ?? 0);

    return {
      queryKey: [queueId, `v=${membershipVersion}`],
      queryFn: () =>
        window.api.audioLibraryControls.getSongInfo(
          songIds,
          'addedOrder',
          undefined,
          undefined,
          false
        )
    };
  },
  favorites: (data: { sortType: SongSortTypes; start?: number; end?: number; limit?: number }) => {
    const { sortType = 'addedOrder', start = 0, end = 0, limit } = data;

    return {
      queryKey: [`sortType=${sortType}`, `start=${start}`, `end=${end}`, `limit=${limit}`],
      queryFn: () =>
        window.api.audioLibraryControls.getAllFavoriteSongs(sortType, {
          start,
          end
        })
    };
  },
  history: (data: {
    sortType: SongSortTypes;
    period?: HistoryPeriod;
    limit?: number;
    start?: number;
    end?: number;
  }) => {
    const { sortType = 'addedOrder', period = 'all', limit, start = 0, end = 0 } = data;

    return {
      queryKey: [
        `sortType=${sortType}`,
        `period=${period}`,
        `limit=${limit}`,
        `start=${start}`,
        `end=${end}`
      ],
      queryFn: () =>
        window.api.audioLibraryControls.getAllHistorySongs(
          sortType,
          { start, end },
          { period, limit }
        )
    };
  },
  recentlyAdded: (data: {
    sortType: SongSortTypes;
    period?: RecentlyAddedPeriod;
    start?: number;
    end?: number;
  }) => {
    const { sortType = 'addedOrder', period = 'today', start = 0, end = 0 } = data;

    return {
      queryKey: [`sortType=${sortType}`, `period=${period}`, `start=${start}`, `end=${end}`],
      queryFn: () =>
        window.api.audioLibraryControls.getAllRecentlyAddedSongs(
          sortType,
          { start, end },
          { period }
        )
    };
  }
});
