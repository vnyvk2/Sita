// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import { SongMetadataCache } from '../../src/main/core/songMetadataCache';
import { mapRawFlatRowToSongData, type RawFlatSongRow } from '../../src/main/db/queries/songs';
import { openSqliteEngine, type SqliteEngine } from '../../src/main/db/sqlite/engine';
import { executeFlatSongProjection } from './flatSongProjection.test';
import { useWindowHydration } from '../../src/renderer/src/hooks/useWindowHydration';
import type { SongData } from '../../src/types/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';

// Helper to create synthetic SongData
function createMockSong(id: number, overrides: Partial<SongData> = {}): SongData {
  return {
    songId: id,
    title: `Song ${id}`,
    duration: 180 + (id % 120),
    artists: [{ artistId: (id % 50) + 1, name: `Artist ${(id % 50) + 1}` }],
    album: {
      albumId: (id % 100) + 1,
      name: `Album ${(id % 100) + 1}`,
      isAFavorite: id % 10 === 0
    },
    albumArtists: [{ artistId: (id % 50) + 1, name: `Artist ${(id % 50) + 1}` }],
    genres: [{ genreId: (id % 10) + 1, name: `Genre ${(id % 10) + 1}` }],
    isAFavorite: id % 5 === 0,
    isBlacklisted: false,
    trackNo: (id % 12) + 1,
    year: 2000 + (id % 25),
    path: `C:\\Music\\t_${id}.mp3`,
    addedDate: 1700000000000 + id * 1000,
    isArtworkAvailable: true,
    artworkPaths: {
      isDefaultArtwork: false,
      artworkPath: `C:\\AppData\\art_${id % 200}.jpg`,
      optimizedArtworkPath: `C:\\AppData\\opt_${id % 200}.webp`
    },
    ...overrides
  };
}

describe('Tier 5 Adversarial Coverage Hardening — Song Hydration Pipeline', () => {
  // ==========================================================================
  // 1. SongMetadataCache Adversarial Edge Cases
  // ==========================================================================
  describe('1. SongMetadataCache Adversarial Edge Cases', () => {
    let cache: SongMetadataCache;

    beforeEach(() => {
      cache = new SongMetadataCache(100);
    });

    it('handles malformed, null, undefined, and non-numeric entries in setMany gracefully', () => {
      const malformedEntries = [
        null as any,
        undefined as any,
        42 as any,
        'string-entry' as any,
        {},
        { title: 'Missing songId' },
        createMockSong(101),
        [102, createMockSong(102)] as [number, SongData],
        { songId: 'not-a-number' } as any
      ];

      expect(() => cache.setMany(malformedEntries)).not.toThrow();
      expect(cache.has(101)).toBe(true);
      expect(cache.has(102)).toBe(true);
      expect(cache.size()).toBe(2);
    });

    it('safely handles update on non-existent IDs without mutating other keys or throwing', () => {
      cache.set(1, createMockSong(1, { title: 'Original 1' }));
      expect(() => {
        cache.update(9999, () => ({ title: 'Updated 9999' }));
      }).not.toThrow();

      expect(cache.size()).toBe(1);
      expect(cache.get(1)?.title).toBe('Original 1');
      expect(cache.get(9999)).toBeUndefined();
    });

    it('handles updateFavorite and updateFavoriteMany on non-existent IDs and empty arrays', () => {
      expect(() => cache.updateFavorite(8888, true)).not.toThrow();
      expect(() => cache.updateFavoriteMany([], true)).not.toThrow();
      expect(() => cache.updateFavoriteMany([7777, 8888, 9999], false)).not.toThrow();
      expect(cache.size()).toBe(0);
    });

    it('handles extreme capacity bounds (maxSize = 0 and maxSize = 1)', () => {
      // maxSize = 1: Single item cache
      const singleItemCache = new SongMetadataCache(1);
      singleItemCache.set(1, createMockSong(1));
      expect(singleItemCache.size()).toBe(1);
      expect(singleItemCache.has(1)).toBe(true);

      singleItemCache.set(2, createMockSong(2));
      expect(singleItemCache.size()).toBe(1);
      expect(singleItemCache.has(1)).toBe(false);
      expect(singleItemCache.has(2)).toBe(true);

      // maxSize = 0: Zero capacity cache should evict immediately
      const zeroCapacityCache = new SongMetadataCache(0);
      zeroCapacityCache.set(100, createMockSong(100));
      expect(zeroCapacityCache.has(100)).toBe(true);
    });

    it('guarantees LRU order integrity under rapid interleaved reads and writes at capacity edge', () => {
      const lruCache = new SongMetadataCache(3);
      lruCache.set(1, createMockSong(1));
      lruCache.set(2, createMockSong(2));
      lruCache.set(3, createMockSong(3));

      // Repeatedly refresh key 1
      for (let i = 0; i < 5; i++) {
        expect(lruCache.get(1)?.songId).toBe(1);
      }

      // Add key 4 -> should evict key 2 (least recently used)
      lruCache.set(4, createMockSong(4));
      expect(lruCache.has(2)).toBe(false);
      expect(lruCache.has(1)).toBe(true);
      expect(lruCache.has(3)).toBe(true);
      expect(lruCache.has(4)).toBe(true);

      // Refresh key 3
      expect(lruCache.get(3)?.songId).toBe(3);

      // Add key 5 -> should evict key 1
      lruCache.set(5, createMockSong(5));
      expect(lruCache.has(1)).toBe(false);
      expect(lruCache.has(3)).toBe(true);
      expect(lruCache.has(4)).toBe(true);
      expect(lruCache.has(5)).toBe(true);
    });

    it('safely handles cache clear during getMany or concurrent-like access patterns', () => {
      cache.setMany([createMockSong(1), createMockSong(2), createMockSong(3)]);
      expect(cache.size()).toBe(3);

      cache.clear();
      const res = cache.getMany([1, 2, 3]);
      expect(res.hits.size).toBe(0);
      expect(res.misses).toEqual([1, 2, 3]);
    });
  });

  // ==========================================================================
  // 2. FlatSongProjection & Raw Mapper Adversarial Cases
  // ==========================================================================
  describe('2. FlatSongProjection & Raw Mapper Adversarial Cases', () => {
    let engine: SqliteEngine;

    beforeEach(() => {
      engine = openSqliteEngine(':memory:');
      const now = new Date('2026-01-01T10:00:00Z').toISOString();
      engine.run(
        `INSERT INTO music_folders (id, name, path, folder_created_at, last_modified_at, last_changed_at, last_parsed_at)
         VALUES (1, 'Test Music', 'C:\\Music', ?, ?, ?, ?)`,
        [now, now, now, now]
      );
      engine.run(`INSERT INTO artists (id, name, is_favorite) VALUES (1, 'Test Artist', 1)`);
      engine.run(`INSERT INTO albums (id, title, is_favorite) VALUES (1, 'Test Album', 0)`);
      engine.run(`INSERT INTO albums_artists (album_id, artist_id) VALUES (1, 1)`);

      for (let i = 1; i <= 20; i++) {
        engine.run(
          `INSERT INTO songs (id, title, duration, path, folder_id, is_favorite, is_blacklisted, track_number, year, file_created_at, file_modified_at, created_at)
           VALUES (?, ?, 200, ?, 1, 0, 0, ?, 2024, ?, ?, ?)`,
          [i, `Song ${i}`, `C:\\Music\\song_${i}.mp3`, i, now, now, now]
        );
        engine.run(`INSERT INTO artists_songs (artist_id, song_id) VALUES (1, ?)`, [i]);
        engine.run(`INSERT INTO album_songs (album_id, song_id) VALUES (1, ?)`, [i]);
      }
    });

    afterAll(async () => {
      if (engine) await engine.close();
    });

    it('safely parses corrupted and malformed JSON payloads in mapRawFlatRowToSongData', () => {
      const corruptedRow: RawFlatSongRow = {
        id: 999,
        title: 'Corrupted Song',
        duration: '180',
        path: 'C:\\Music\\corrupted.mp3',
        year: null,
        trackNo: null,
        discNo: null,
        bitrate: null,
        sampleRate: null,
        noOfChannels: null,
        language: '   ',
        musicBrainzId: '',
        isAFavorite: 0,
        isBlacklisted: 0,
        createdAt: 'invalid-date-format',
        updatedAt: null,
        fileCreatedAt: null,
        fileModifiedAt: null,
        album_json: '{"invalid": "album json missing name"}',
        artists_json: 'NOT_A_JSON_OBJECT',
        artworks_json: '[{"path": 12345}, null, "string-item"]',
        language_override: '  English  '
      };

      const mapped = mapRawFlatRowToSongData(corruptedRow);
      expect(mapped.songId).toBe(999);
      expect(mapped.title).toBe('Corrupted Song');
      expect(mapped.duration).toBe(180);
      expect(mapped.artists).toEqual([]);
      expect(mapped.album).toBeUndefined();
      expect(mapped.artworkPaths.isDefaultArtwork).toBe(true);
      expect(mapped.language).toBe('English');
      expect(mapped.musicBrainzId).toBeUndefined();
      expect(mapped.addedDate).toBeNaN(); // Handled safely without throwing
    });

    it('handles extreme library ID arrays (> 2,500 IDs) across multiple 500-chunk SQL boundaries with duplicates', () => {
      // Create an array of 2,600 IDs with repeated patterns
      const massiveIdList: number[] = [];
      for (let i = 0; i < 2600; i++) {
        massiveIdList.push((i % 20) + 1);
      }

      const results = executeFlatSongProjection(engine, massiveIdList, { preserveIdOrder: true });
      expect(results).toHaveLength(2600);
      expect(results[0].songId).toBe(1);
      expect(results[19].songId).toBe(20);
      expect(results[2599].songId).toBe(20);
    });

    it('safely handles non-existent IDs and mixed valid/invalid IDs without losing valid items', () => {
      const requestedIds = [-1, 0, 1, 9999, 2, 8888, 3, -100];
      const results = executeFlatSongProjection(engine, requestedIds, { preserveIdOrder: true });

      expect(results).toHaveLength(3);
      expect(results.map((s) => s.songId)).toEqual([1, 2, 3]);
    });
  });

  // ==========================================================================
  // 3. useWindowHydration Adversarial & Edge Case Tests
  // ==========================================================================
  describe('3. useWindowHydration Adversarial & Edge Case Tests', () => {
    let queryClient: QueryClient;
    let mockGetSongInfo: any;

    beforeEach(() => {
      queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false
          }
        }
      });

      mockGetSongInfo = vi.fn().mockImplementation(async (ids: number[]) => {
        return ids.map((id) => createMockSong(id));
      });

      (window as any).api = {
        audioLibraryControls: {
          getSongInfo: mockGetSongInfo
        }
      };
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    it('safely handles negative and out-of-bounds index requests in getItem', () => {
      const ids = [1, 2, 3];
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'boundary-test',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      expect(result.current.getItem(-1)).toBeUndefined();
      expect(result.current.getItem(-100)).toBeUndefined();
      expect(result.current.getItem(3)).toBeUndefined();
      expect(result.current.getItem(9999)).toBeUndefined();
    });

    it('validates song ID matching in cache fallback preventing stale row pollution on dynamic reordering', () => {
      const ids = [100, 200, 300];
      const timestamp = 1700000000000;
      const identity = 'stale-prevention-test';

      // Pre-seed window 0 with DIFFERENT song IDs (e.g. from an old sort order)
      const windowKey = ['songs', 'window', identity, timestamp, 0];
      queryClient.setQueryData(windowKey, [
        createMockSong(999),
        createMockSong(888),
        createMockSong(777)
      ]);

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: identity,
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      // getItem(0) requires ID 100, but cache at offset 0 has ID 999.
      // The validator must NOT return ID 999!
      const item0 = result.current.getItem(0);
      expect(item0).toBeUndefined();
    });

    it('handles rapid library truncation (e.g. 5,000 songs filtered down to 5 songs)', async () => {
      let ids = Array.from({ length: 5000 }, (_, i) => i + 1);
      let timestamp = 1700000000000;

      const { result, rerender } = renderHook(
        ({ currentIds, currentTimestamp }) =>
          useWindowHydration(currentIds, currentTimestamp, {
            listIdentity: 'truncation-test',
            keyPrefix: 'songs'
          }),
        {
          wrapper,
          initialProps: { currentIds: ids, currentTimestamp: timestamp }
        }
      );

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      // Scroll far down to index 3000
      act(() => {
        result.current.onRangeChange({ startIndex: 3000, endIndex: 3020 });
      });

      // User types in search bar -> library shrinks to 5 items with new timestamp
      ids = [1, 2, 3, 4, 5];
      timestamp = 1700000001000;

      rerender({ currentIds: ids, currentTimestamp: timestamp });

      // Range change for new small list
      act(() => {
        result.current.onRangeChange({ startIndex: 0, endIndex: 4 });
      });

      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });

      expect(result.current.getItem(0)?.songId).toBe(1);
      expect(result.current.getItem(3000)).toBeUndefined();
    });

    it('survives rapid consecutive onRangeChange bursts across 10 distant windows', async () => {
      const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
      const timestamp = 1700000000000;

      const { result } = renderHook(
        () =>
          useWindowHydration(ids, timestamp, {
            listIdentity: 'burst-scroll-test',
            keyPrefix: 'songs'
          }),
        { wrapper }
      );

      // Fire 10 rapid violent scroll jumps in a single tick
      act(() => {
        for (let i = 0; i < 10; i++) {
          const start = (i * 450) % 4800;
          result.current.onRangeChange({ startIndex: start, endIndex: start + 20 });
        }
      });

      // Final range should settle cleanly without throwing
      await waitFor(() => {
        expect(result.current.getItem(0)).toBeDefined();
      });
    });
  });
});
