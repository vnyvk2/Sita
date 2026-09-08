import { createQueryKeys } from '@lukemorales/query-key-factory';
import { keepPreviousData } from '@tanstack/react-query';

export const GENRE_SUMMARY_PAGE_SIZE = 60;

export interface GenreSummariesParams {
  sortType: GenreSortTypes;
}

export const GENRE_SUMMARIES_ROOT = ['genres', 'summaries'] as const;

export const genreSummariesQueryKey = (params: GenreSummariesParams) =>
  [...GENRE_SUMMARIES_ROOT, `sortType=${params.sortType}`] as const;

export const fetchGenreSummariesPage = async (
  params: GenreSummariesParams,
  start: number
): Promise<PaginatedResult<GenreSummary, GenreSortTypes>> => {
  return window.api.genresData.getGenreSummaries(
    params.sortType,
    start,
    start + GENRE_SUMMARY_PAGE_SIZE
  );
};

export const genreSummariesQuery = (params: GenreSummariesParams & { start?: number }) => {
  const { start = 0 } = params;
  return {
    queryKey: [...genreSummariesQueryKey(params), `start=${start}`],
    queryFn: () => fetchGenreSummariesPage(params, start),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  };
};

export const genreQuery = createQueryKeys('genres', {
  all: (data: { sortType: GenreSortTypes; start?: number; end?: number; limit?: number }) => {
    const { sortType = 'aToZ', start = 0, end = 0 } = data;

    return {
      queryKey: [`sortType=${sortType}`, `start=${start}`, `end=${end}`, `limit=${end - start}`],
      queryFn: () => window.api.genresData.getGenresData([], sortType as GenreSortTypes, start, end)
    };
  },
  single: (data: { genreId: number }) => {
    return {
      queryKey: [data.genreId],
      queryFn: () => window.api.genresData.getGenresData([data.genreId])
    };
  }
});
