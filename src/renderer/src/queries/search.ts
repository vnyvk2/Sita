import { createQueryKeys } from '@lukemorales/query-key-factory';

import log from '../utils/log';

export const searchQuery = createQueryKeys('search', {
  recentResults: {
    queryKey: null,
    queryFn: () => window.api.userData.getUserData().then((data) => data.recentSearches)
  },
  query: (data: {
    keyword: string;
    filter: SearchFilters;
    updateSearchHistory?: boolean;
    isSimilaritySearchEnabled?: boolean;
  }) => {
    const { keyword, filter, isSimilaritySearchEnabled = false, updateSearchHistory = true } = data;

    return {
      queryKey: [
        `keyword=${keyword}`,
        `filter=${filter}`,
        `isSimilaritySearchEnabled=${isSimilaritySearchEnabled}`,
        `updateSearchHistory=${updateSearchHistory}`
      ],
      queryFn: async () => {
        try {
          return await window.api.search.query({
            filter,
            keyword,
            updateSearchHistory,
            isSimilaritySearchEnabled
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          log(error);
          throw error;
        }
      }
    };
  }
});
