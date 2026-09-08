import { ALBUM_SUMMARIES_ROOT, albumQuery } from '@renderer/queries/albums';
import { ARTIST_SUMMARIES_ROOT, artistQuery } from '@renderer/queries/artists';
import { GENRE_SUMMARIES_ROOT, genreQuery } from '@renderer/queries/genres';
import type { QueryClient } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import {
  DataSyncBatcher,
  getInvalidationTargetsForEvent,
  invalidateTarget,
  invalidateWindowsContainingIds
} from '../useDataSync';

describe('useDataSync - Query Invalidation & Batching', () => {
  describe('getInvalidationTargetsForEvent mapping', () => {
    it('should map structural song events to song lists, history, and search without touching artists or albums', () => {
      const targets = getInvalidationTargetsForEvent('songs/updatedSong');

      expect(targets).toContain('songs:all');
      expect(targets).toContain('songs:recentlyAdded');
      expect(targets).toContain('songs:history');
      expect(targets).toContain('search:query');
      expect(targets).toContain('home:recentlyPlayedSongs');

      // Negative assertions: domain isolation
      expect(targets).not.toContain('artists:all');
      expect(targets).not.toContain('albums:all');
      expect(targets).not.toContain('genres:all');
    });

    it('should map songs/artworks to songQuery.all and albums because getAllSongs returns artworkPaths', () => {
      const targets = getInvalidationTargetsForEvent('songs/artworks');

      expect(targets).toContain('songs:all');
      expect(targets).toContain('songs:allInfo');
      expect(targets).toContain('songs:singleInfo');
      expect(targets).toContain('albums:all');
      expect(targets).toContain('albums:single');

      // Negative assertions: pure visual asset does not invalidate history, search, or genres
      expect(targets).not.toContain('search:query');
      expect(targets).not.toContain('genres:all');
      expect(targets).not.toContain('home:recentSongArtists');
    });

    it('should return empty targets for pure visual asset events (palette, lyrics)', () => {
      expect(getInvalidationTargetsForEvent('songs/palette')).toEqual([]);
      expect(getInvalidationTargetsForEvent('songs/lyrics')).toEqual([]);
    });

    it('should isolate artist events to artist queries and home artist metrics only', () => {
      const targets = getInvalidationTargetsForEvent('artists/updatedArtist');

      expect(targets).toContain('artists:all');
      expect(targets).toContain('artists:single');
      expect(targets).toContain('home:recentSongArtists');
      expect(targets).toContain('search:query');

      // Negative assertion: artists NEVER invalidate bulk song lists
      expect(targets).not.toContain('songs:all');
      expect(targets).not.toContain('albums:all');
      expect(targets).not.toContain('genres:all');
    });

    it('should isolate album events to album queries without invalidating song lists', () => {
      const targets = getInvalidationTargetsForEvent('albums/newAlbum');

      expect(targets).toContain('albums:all');
      expect(targets).toContain('albums:single');
      expect(targets).toContain('search:query');

      // Negative assertion: albums NEVER invalidate bulk song lists
      expect(targets).not.toContain('songs:all');
      expect(targets).not.toContain('artists:all');
      expect(targets).not.toContain('genres:all');
    });

    it('should isolate genre events to genre queries only', () => {
      const targets = getInvalidationTargetsForEvent('genres/newGenre');

      expect(targets).toEqual(['genres:all', 'genres:single', 'analytics:listening']);
      expect(targets).not.toContain('songs:all');
      expect(targets).not.toContain('artists:all');
    });

    it('should bump ID lists and facets for structural song events (windowed hydration era)', () => {
      const targets = getInvalidationTargetsForEvent('songs');

      expect(targets).toContain('songs:ids');
      expect(targets).toContain('songs:facets');
      // transition-safety net while legacy consumers remain
      expect(targets).toContain('songs:all');
    });

    it('should bump ID lists for tag edits (order/filter parity) without surgical windows', () => {
      const targets = getInvalidationTargetsForEvent('songs/updatedSong');

      expect(targets).toContain('songs:ids');
      expect(targets).toContain('songs:facets');
      expect(targets).not.toContain('songs:windows');
    });

    it('should request surgical window refresh for likes and artwork events', () => {
      expect(getInvalidationTargetsForEvent('songs/likes')).toContain('songs:windows');
      expect(getInvalidationTargetsForEvent('songs/artworks')).toContain('songs:windows');
    });
  });

  describe('DataSyncBatcher deduplication & scheduling', () => {
    let mockClient: QueryClient;
    let scheduledCallback: (() => void) | null = null;
    let cancelScheduledFn: Mock;

    beforeEach(() => {
      scheduledCallback = null;
      cancelScheduledFn = vi.fn();
      mockClient = {
        invalidateQueries: vi.fn()
      } as unknown as QueryClient;
    });

    const testScheduler = (cb: () => void) => {
      scheduledCallback = cb;
      return () => {
        cancelScheduledFn();
        scheduledCallback = null;
      };
    };

    it('should coalesce 100 rapid events into exactly 1 invalidation per affected query key on frame flush', () => {
      const batcher = new DataSyncBatcher(testScheduler, mockClient);

      // Emit 100 rapid songs/artworks events
      const events: DataUpdateEvent[] = Array.from({ length: 100 }, () => ({
        dataType: 'songs/artworks' as DataUpdateEventTypes,
        eventData: []
      }));

      batcher.handleEvents(events);

      // Before frame fires: 0 invalidations executed
      expect(mockClient.invalidateQueries).not.toHaveBeenCalled();
      expect(scheduledCallback).not.toBeNull();

      // Flush the scheduled frame
      scheduledCallback!();

      // After flush: 5 unique invalidation targets called:
      // songs:all, songs:allInfo, songs:singleInfo, albums:single (1 call each)
      // albums:all (2 calls: albumQuery.all._def + ALBUM_SUMMARIES_ROOT)
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(6);
      const albumCalls = (mockClient.invalidateQueries as Mock).mock.calls.map((c) => c[0]?.queryKey);
      expect(albumCalls).toContainEqual(ALBUM_SUMMARIES_ROOT);
    });

    it('should merge disparate event types into the minimal deduplicated union of targets', () => {
      const batcher = new DataSyncBatcher(testScheduler, mockClient);

      batcher.handleEvents([
        { dataType: 'songs/palette', eventData: [] }, // 0 targets
        { dataType: 'artists/artworks', eventData: [] }, // artists:all, artists:single
        { dataType: 'artists/updatedArtist', eventData: [] } // artists:all, artists:single, home:recentSongArtists, search:query
      ]);

      expect(mockClient.invalidateQueries).not.toHaveBeenCalled();

      // Flush the scheduled frame
      scheduledCallback!();

      // Minimal union: artists:all, artists:single, home:recentSongArtists, search:query, analytics:listening
      // artists:all invalidates both artistQuery.all._def and ARTIST_SUMMARIES_ROOT (6 calls total)
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(6);
      const artistCalls = (mockClient.invalidateQueries as Mock).mock.calls.map((c) => c[0]?.queryKey);
      expect(artistCalls).toContainEqual(ARTIST_SUMMARIES_ROOT);
    });

    it('should surgically invalidate only the hydration windows containing changed song ids', () => {
      const invalidateQueries = vi.fn();
      const libraryIds = Array.from({ length: 400 }, (_, i) => i + 1);
      const mockCacheClient = {
        invalidateQueries,
        getQueryCache: () => ({
          findAll: () => [
            {
              state: {
                dataUpdatedAt: 1000,
                data: { ids: libraryIds, total: 400, blacklistedIds: [] }
              }
            }
          ]
        })
      } as unknown as QueryClient;

      const batcher = new DataSyncBatcher(testScheduler, mockCacheClient);
      batcher.handleEvents([
        { dataType: 'songs/likes', eventData: [{ data: [11] }] },
        { dataType: 'songs/artworks', eventData: [{ data: [250] }] }
      ]);
      scheduledCallback!();

      const invalidatedKeys = invalidateQueries.mock.calls.map((call) => call[0]?.queryKey);
      // id 11 -> index 10 -> window 0; id 250 -> index 249 -> window 200 (version 1000, listIdentity 'ids=default')
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1000, 0]);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1000, 200]);
    });

    it('should clean up and cancel scheduled frame on unmount/cleanup', () => {
      const batcher = new DataSyncBatcher(testScheduler, mockClient);

      batcher.handleEvents([{ dataType: 'songs/newSong', eventData: [] }]);
      expect(scheduledCallback).not.toBeNull();

      batcher.cleanup();
      expect(cancelScheduledFn).toHaveBeenCalled();
    });
  });

  describe('invalidateWindowsContainingIds fast-path vs fallback', () => {
    const libraryIds = Array.from({ length: 600 }, (_, i) => i + 1);
    const mockCache = {
      findAll: () => [
        {
          queryKey: ['songs', 'ids', undefined],
          state: {
            dataUpdatedAt: 1234,
            data: { ids: libraryIds, total: 600, blacklistedIds: [] }
          }
        }
      ]
    };

    it('should do nothing when changedIds is empty', () => {
      const invalidateQueries = vi.fn();
      const mockClient = {
        invalidateQueries,
        getQueryCache: () => mockCache
      } as unknown as QueryClient;

      invalidateWindowsContainingIds(mockClient, new Set());
      expect(invalidateQueries).not.toHaveBeenCalled();
    });

    it('should use fast-path (<= 32 IDs) with early-exit and correct window offset calculation', () => {
      const invalidateQueries = vi.fn();
      const mockClient = {
        invalidateQueries,
        getQueryCache: () => mockCache
      } as unknown as QueryClient;

      // 3 IDs: id 5 (index 4 -> window 0), id 250 (index 249 -> window 200), id 405 (index 404 -> window 400)
      const changed = new Set([5, 250, 405]);
      invalidateWindowsContainingIds(mockClient, changed);

      expect(invalidateQueries).toHaveBeenCalledTimes(3);
      const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0]?.queryKey);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 0]);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 200]);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 400]);
    });

    it('should use fallback path (> 32 IDs) via Map lookup across multiple windows', () => {
      const invalidateQueries = vi.fn();
      const mockClient = {
        invalidateQueries,
        getQueryCache: () => mockCache
      } as unknown as QueryClient;

      // 35 IDs (> 32): 20 in window 0 (ids 1..20), 10 in window 200 (ids 201..210), 5 in window 400 (ids 401..405)
      const changed = new Set<number>();
      for (let i = 1; i <= 20; i += 1) changed.add(i);
      for (let i = 201; i <= 210; i += 1) changed.add(i);
      for (let i = 401; i <= 405; i += 1) changed.add(i);
      expect(changed.size).toBe(35);

      invalidateWindowsContainingIds(mockClient, changed);

      // Invalidation is called per ID in changedIds matching an index
      expect(invalidateQueries).toHaveBeenCalledTimes(35);
      const invalidatedKeys = invalidateQueries.mock.calls.map((c) => c[0]?.queryKey);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 0]);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 200]);
      expect(invalidatedKeys).toContainEqual(['songs', 'window', 'ids=default', 1234, 400]);
    });

    it('should safely skip unknown IDs not present in cached list', () => {
      const invalidateQueries = vi.fn();
      const mockClient = {
        invalidateQueries,
        getQueryCache: () => mockCache
      } as unknown as QueryClient;

      // IDs 9999, 8888 don't exist in libraryIds
      const changed = new Set([9999, 8888]);
      invalidateWindowsContainingIds(mockClient, changed);
      expect(invalidateQueries).not.toHaveBeenCalled();

      // In fallback (> 32)
      const bulkChanged = new Set(Array.from({ length: 35 }, (_, i) => 10000 + i));
      invalidateWindowsContainingIds(mockClient, bulkChanged);
      expect(invalidateQueries).not.toHaveBeenCalled();
    });
  });

  describe('invalidateTarget dual summaries invalidation', () => {
    let mockClient: QueryClient;

    beforeEach(() => {
      mockClient = {
        invalidateQueries: vi.fn()
      } as unknown as QueryClient;
    });

    it('should invalidate both factory _def and summaries root for artists:all', () => {
      invalidateTarget('artists:all', mockClient);
      const calls = (mockClient.invalidateQueries as Mock).mock.calls.map((c) => c[0]?.queryKey);
      expect(calls).toContainEqual(artistQuery.all._def);
      expect(calls).toContainEqual(ARTIST_SUMMARIES_ROOT);
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(2);
    });

    it('should invalidate both factory _def and summaries root for albums:all', () => {
      invalidateTarget('albums:all', mockClient);
      const calls = (mockClient.invalidateQueries as Mock).mock.calls.map((c) => c[0]?.queryKey);
      expect(calls).toContainEqual(albumQuery.all._def);
      expect(calls).toContainEqual(ALBUM_SUMMARIES_ROOT);
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(2);
    });

    it('should invalidate both factory _def and summaries root for genres:all', () => {
      invalidateTarget('genres:all', mockClient);
      const calls = (mockClient.invalidateQueries as Mock).mock.calls.map((c) => c[0]?.queryKey);
      expect(calls).toContainEqual(genreQuery.all._def);
      expect(calls).toContainEqual(GENRE_SUMMARIES_ROOT);
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(2);
    });
  });
});
