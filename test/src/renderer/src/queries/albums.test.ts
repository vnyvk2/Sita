import { albumQuery } from '@renderer/queries/albums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('albumQuery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.window = {} as unknown as Window & typeof globalThis;
  });

  describe('all queryKey', () => {
    it('should include filterType in queryKey', () => {
      const query = albumQuery.all({
        sortType: 'aToZ',
        filterType: 'favorites',
        start: 0,
        end: 10,
        keyword: 'hybrid'
      });

      expect(query.queryKey).toEqual([
        'albums',
        'all',
        'sortType=aToZ',
        'filterType=favorites',
        'start=0',
        'end=10',
        'limit=10',
        'keyword=hybrid'
      ]);
    });
  });

  describe('all queryFn search filtering', () => {
    it('should filter search results to favorites only when filterType is favorites', async () => {
      const mockAlbums = [
        { albumId: 1, title: 'Meteora', isAFavorite: true },
        { albumId: 2, title: 'Hybrid Theory', isAFavorite: false },
        { albumId: 3, title: 'Minutes to Midnight', isAFavorite: true }
      ];

      (globalThis.window as unknown as { api: { search: { query: unknown } } }).api = {
        search: {
          query: vi.fn().mockResolvedValue({
            albums: mockAlbums
          })
        }
      };

      const query = albumQuery.all({
        sortType: 'aToZ',
        filterType: 'favorites',
        keyword: 'Linkin'
      });

      const result = await query.queryFn();

      expect(result).toEqual({
        data: [
          { albumId: 1, title: 'Meteora', isAFavorite: true },
          { albumId: 3, title: 'Minutes to Midnight', isAFavorite: true }
        ],
        unresolvedData: []
      });
    });

    it('should return all search results when filterType is notSelected', async () => {
      const mockAlbums = [
        { albumId: 1, title: 'Meteora', isAFavorite: true },
        { albumId: 2, title: 'Hybrid Theory', isAFavorite: false }
      ];

      (globalThis.window as unknown as { api: { search: { query: unknown } } }).api = {
        search: {
          query: vi.fn().mockResolvedValue({
            albums: mockAlbums
          })
        }
      };

      const query = albumQuery.all({
        sortType: 'aToZ',
        filterType: 'notSelected',
        keyword: 'Linkin'
      });

      const result = await query.queryFn();

      expect(result).toEqual({
        data: mockAlbums,
        unresolvedData: []
      });
    });

    it('should call getAlbumData with filterType when keyword is empty', async () => {
      const mockResult = { data: [{ albumId: 1, title: 'Meteora' }], unresolvedData: [] };
      const getAlbumDataMock = vi.fn().mockResolvedValue(mockResult);

      (globalThis.window as unknown as { api: { albumsData: { getAlbumData: unknown } } }).api = {
        albumsData: {
          getAlbumData: getAlbumDataMock
        }
      };

      const query = albumQuery.all({
        sortType: 'aToZ',
        filterType: 'favorites',
        start: 0,
        end: 20
      });

      const result = await query.queryFn();

      expect(getAlbumDataMock).toHaveBeenCalledWith([], 'aToZ', 'favorites', 0, 20);
      expect(result).toEqual(mockResult);
    });
  });
});
