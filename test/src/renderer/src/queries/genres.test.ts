import {
  GENRE_SUMMARIES_ROOT,
  GENRE_SUMMARY_PAGE_SIZE,
  genreSummariesQuery,
  genreSummariesQueryKey,
  fetchGenreSummariesPage
} from '@renderer/queries/genres';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('genreSummaries queries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.window = {} as unknown as Window & typeof globalThis;
  });

  describe('genreSummariesQueryKey', () => {
    it('should generate expected query key array with parameters', () => {
      const key = genreSummariesQueryKey({
        sortType: 'aToZ'
      });

      expect(key).toEqual([
        ...GENRE_SUMMARIES_ROOT,
        'sortType=aToZ'
      ]);
    });
  });

  describe('fetchGenreSummariesPage', () => {
    it('should invoke window.api.genresData.getGenreSummaries', async () => {
      const mockResult = {
        data: [
          {
            genreId: 1,
            name: 'Rock',
            artworkPaths: { default: '' },
            songCount: 50
          }
        ],
        sortType: 'aToZ' as const,
        start: 0,
        end: 60,
        total: 1
      };

      const getGenreSummariesMock = vi.fn().mockResolvedValue(mockResult);
      (globalThis.window as unknown as { api: { genresData: { getGenreSummaries: unknown } } }).api = {
        genresData: {
          getGenreSummaries: getGenreSummariesMock
        }
      };

      const result = await fetchGenreSummariesPage(
        { sortType: 'aToZ' },
        0
      );

      expect(getGenreSummariesMock).toHaveBeenCalledWith('aToZ', 0, GENRE_SUMMARY_PAGE_SIZE);
      expect(result).toEqual(mockResult);
    });
  });

  describe('genreSummariesQuery', () => {
    it('returns valid TanStack Query configuration', () => {
      const query = genreSummariesQuery({
        sortType: 'aToZ',
        start: 0
      });

      expect(query.queryKey).toContain('start=0');
      expect(query.staleTime).toBe(5 * 60 * 1000);
      expect(query.gcTime).toBe(30 * 60 * 1000);
    });
  });
});
