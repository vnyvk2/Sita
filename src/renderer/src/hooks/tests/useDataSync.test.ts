import type { QueryClient } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

import { DataSyncBatcher, getInvalidationTargetsForEvent } from '../useDataSync';

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

      expect(targets).toEqual(['genres:all', 'genres:single']);
      expect(targets).not.toContain('songs:all');
      expect(targets).not.toContain('artists:all');
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

      // After flush: exactly 5 unique invalidation targets called (1 time each)
      // targets: songs:all, songs:allInfo, songs:singleInfo, albums:all, albums:single
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(5);
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

      // Minimal union: artists:all, artists:single, home:recentSongArtists, search:query (4 unique targets)
      expect(mockClient.invalidateQueries).toHaveBeenCalledTimes(4);
    });

    it('should clean up and cancel scheduled frame on unmount/cleanup', () => {
      const batcher = new DataSyncBatcher(testScheduler, mockClient);

      batcher.handleEvents([{ dataType: 'songs/newSong', eventData: [] }]);
      expect(scheduledCallback).not.toBeNull();

      batcher.cleanup();
      expect(cancelScheduledFn).toHaveBeenCalled();
    });
  });
});
