import { createQueryKeys } from '@lukemorales/query-key-factory';

import { SEARCH_LIMITS } from '../../../common/search/MatchTier';

export const SONG_WINDOW_SIZE = 200;
export const SONG_WINDOW_STALE_TIME = 10 * 60 * 1000;
export const SONG_WINDOW_GC_TIME = 5 * 60 * 1000;
export const SONG_IDS_STALE_TIME = 5 * 60 * 1000;
export const SONG_IDS_GC_TIME = 30 * 60 * 1000;

export interface SongIdsParams {
  sortType: SongSortTypes;
  filterType?: SongFilterTypes;
  keyword?: string;
  language?: string;
  genre?: string;
  onlyFavoriteArtists?: boolean;
  onlyFavoriteAlbums?: boolean;
}

export interface SongIdsResult {
  ids: number[];
  total: number;
  blacklistedIds: number[];
}

export const getSongListIdentity = (params: SongIdsParams | unknown): string => {
  if (typeof params === 'string') {
    return params.startsWith('ids=') ? params : `ids=${params}`;
  }
  if (params && typeof params === 'object') {
    return `ids=${JSON.stringify(params)}`;
  }
  return 'ids=default';
};

export const songCacheKeys = {
  windowsRoot: ['songs', 'window'] as const,
  window: (listIdentity: string, version: number | string, start: number) =>
    ['songs', 'window', listIdentity, version, start] as const
};

export const songIdsVersionFromState = (dataUpdatedAt: number | undefined): number =>
  Math.floor(dataUpdatedAt ?? 0);

export const songQuery = createQueryKeys('songs', {
  ids: (params: SongIdsParams) => {
    return {
      queryKey: [params],
      queryFn: async (): Promise<SongIdsResult> => {
        if (params.keyword?.trim()) {
          const res = await window.api.search.query({
            filter: 'Songs',
            keyword: params.keyword,
            limit: SEARCH_LIMITS.PAGE,
            updateSearchHistory: false
          });
          const ids = res.songs.map((song) => song.songId);
          return {
            ids,
            total: ids.length,
            blacklistedIds: res.songs
              .filter((song) => song.isBlacklisted)
              .map((song) => song.songId)
          };
        }
        return window.api.audioLibraryControls.getFilteredSongLibraryIds(params);
      }
    };
  },
  facets: () => ({
    queryKey: ['facets'],
    queryFn: () => window.api.audioLibraryControls.getSongListFacets()
  }),
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
