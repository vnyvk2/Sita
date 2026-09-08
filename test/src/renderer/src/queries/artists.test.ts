import {
  ARTIST_SUMMARIES_ROOT,
  ARTIST_SUMMARY_PAGE_SIZE,
  artistSummariesQuery,
  artistSummariesQueryKey,
  fetchArtistSummariesPage
} from '@renderer/queries/artists';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('artistSummaries queries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.window = {} as unknown as Window & typeof globalThis;
  });

  describe('artistSummariesQueryKey', () => {
    it('should generate expected query key array with parameters', () => {
      const key = artistSummariesQueryKey({
        sortType: 'aToZ',
        filterType: 'favorites',
        keyword: 'queen'
      });

      expect(key).toEqual([
        ...ARTIST_SUMMARIES_ROOT,
        'sortType=aToZ',
        'filterType=favorites',
        'keyword=queen'
      ]);
    });
  });

  describe('fetchArtistSummariesPage', () => {
    it('should invoke window.api.artistsData.getArtistSummaries when no keyword', async () => {
      const mockResult = {
        data: [
          {
            artistId: 1,
            name: 'Queen',
            isAFavorite: true,
            artworkPaths: { default: '' },
            songCount: 15
          }
        ],
        sortType: 'aToZ' as const,
        start: 0,
        end: 120,
        total: 1
      };

      const getArtistSummariesMock = vi.fn().mockResolvedValue(mockResult);
      (globalThis.window as unknown as { api: { artistsData: { getArtistSummaries: unknown } } }).api = {
        artistsData: {
          getArtistSummaries: getArtistSummariesMock
        }
      };

      const result = await fetchArtistSummariesPage(
        { sortType: 'aToZ', filterType: 'notSelected' },
        0
      );

      expect(getArtistSummariesMock).toHaveBeenCalledWith('aToZ', 'notSelected', 0, ARTIST_SUMMARY_PAGE_SIZE);
      expect(result).toEqual(mockResult);
    });

    it('should perform search via window.api.search.query and map to ArtistSummary when keyword is present', async () => {
      const mockArtists: Artist[] = [
        {
          artistId: 1,
          name: 'Queen',
          isAFavorite: true,
          songs: [{ songId: 101 } as SongData],
          artworkPaths: { default: '' }
        },
        {
          artistId: 2,
          name: 'Queens of the Stone Age',
          isAFavorite: false,
          songs: [{ songId: 201 } as SongData, { songId: 202 } as SongData],
          artworkPaths: { default: '' }
        }
      ];

      const searchMock = vi.fn().mockResolvedValue({ artists: mockArtists });
      (globalThis.window as unknown as { api: { search: { query: unknown } } }).api = {
        search: {
          query: searchMock
        }
      };

      const result = await fetchArtistSummariesPage(
        { sortType: 'aToZ', filterType: 'favorites', keyword: 'Queen' },
        0
      );

      expect(searchMock).toHaveBeenCalledWith({
        filter: 'Artists',
        keyword: 'Queen',
        limit: 250,
        updateSearchHistory: false
      });

      // Filtered to favorites only
      expect(result.data).toEqual([
        {
          artistId: 1,
          name: 'Queen',
          isAFavorite: true,
          artworkPaths: { default: '' },
          onlineArtworkPaths: undefined,
          songCount: 1
        }
      ]);
      expect(result.total).toBe(1);
    });
  });

  describe('artistSummariesQuery', () => {
    it('returns valid TanStack Query configuration', () => {
      const query = artistSummariesQuery({
        sortType: 'aToZ',
        filterType: 'notSelected',
        start: 0
      });

      expect(query.queryKey).toContain('start=0');
      expect(query.staleTime).toBe(5 * 60 * 1000);
      expect(query.gcTime).toBe(30 * 60 * 1000);
    });
  });
});
