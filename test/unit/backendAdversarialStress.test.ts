import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SongMetadataCache } from '../../src/main/core/songMetadataCache';
import { mapRawFlatRowToSongData, type RawFlatSongRow } from '../../src/main/db/queries/songs';
import { openSqliteEngine, type SqliteEngine } from '../../src/main/db/sqlite/engine';
import { executeFlatSongProjection } from './flatSongProjection.test';
import type { SongData } from '../../src/types/app';

function createAdversarialSong(id: number, overrides: Partial<SongData> = {}): SongData {
  return {
    songId: id,
    title: `Adversarial Track ${id}`,
    duration: 120 + (Math.abs(id) % 240),
    artists: [{ artistId: (Math.abs(id) % 100) + 1, name: `Artist ${(Math.abs(id) % 100) + 1}` }],
    album: {
      albumId: (Math.abs(id) % 200) + 1,
      name: `Album ${(Math.abs(id) % 200) + 1}`,
      isAFavorite: id % 2 === 0
    },
    albumArtists: [{ artistId: (Math.abs(id) % 100) + 1, name: `Artist ${(Math.abs(id) % 100) + 1}` }],
    genres: [{ genreId: (Math.abs(id) % 20) + 1, name: `Genre ${(Math.abs(id) % 20) + 1}` }],
    isAFavorite: id % 3 === 0,
    isBlacklisted: id % 11 === 0,
    trackNo: (Math.abs(id) % 15) + 1,
    year: 1980 + (Math.abs(id) % 45),
    path: `C:\\Music\\adv_${id}.flac`,
    addedDate: 1700000000000 + Math.abs(id) * 100,
    isArtworkAvailable: true,
    artworkPaths: {
      isDefaultArtwork: false,
      artworkPath: `C:\\AppData\\art_${Math.abs(id) % 50}.jpg`,
      optimizedArtworkPath: `C:\\AppData\\opt_${Math.abs(id) % 50}.webp`
    },
    ...overrides
  };
}

describe('Adversarial Stress Harness: Concurrency & Mutation Races', () => {
  let cache: SongMetadataCache;

  beforeEach(() => {
    cache = new SongMetadataCache(1000);
  });

  it(
    'Stress 1: High-volume parallel setMany, getMany, and updateFavorite operations without race corruption',
    async () => {
    // Populate baseline cache
    for (let i = 1; i <= 500; i++) {
      cache.set(i, createAdversarialSong(i, { isAFavorite: false }));
    }

    const CONCURRENT_WORKERS = 50;
    const workers: Promise<void>[] = [];

    // Worker type 1: Readers constantly reading random batch chunks
    for (let w = 0; w < 20; w++) {
      workers.push(
        (async () => {
          for (let iter = 0; iter < 50; iter++) {
            const requestedIds = Array.from({ length: 50 }, (_, i) => ((w * 50 + iter * 13 + i) % 600) + 1);
            const { hits, misses } = cache.getMany(requestedIds);
            expect(hits.size + misses.length).toBeGreaterThanOrEqual(50);
            for (const [id, song] of hits.entries()) {
              expect(song.songId).toBe(id);
              expect(typeof song.title).toBe('string');
            }
          }
        })()
      );
    }

    // Worker type 2: Writers updating favorite status rapidly
    for (let w = 0; w < 15; w++) {
      workers.push(
        (async () => {
          for (let iter = 0; iter < 50; iter++) {
            const targetIds = Array.from({ length: 20 }, (_, i) => ((iter * 7 + i) % 500) + 1);
            const isFav = iter % 2 === 0;
            cache.updateFavoriteMany(targetIds, isFav);
          }
        })()
      );
    }

    // Worker type 3: Overwriters replacing and inserting entries
    for (let w = 0; w < 15; w++) {
      workers.push(
        (async () => {
          for (let iter = 0; iter < 30; iter++) {
            const newEntries = Array.from({ length: 10 }, (_, i) => {
              const id = 500 + ((w * 10 + i) % 500);
              return createAdversarialSong(id, { title: `Updated Song ${id} by worker ${w}` });
            });
            cache.setMany(newEntries);
          }
        })()
      );
    }

    await Promise.all(workers);

    // After all chaotic concurrency, ensure cache is intact and within bounds
    expect(cache.size()).toBeLessThanOrEqual(1000);
    expect(cache.size()).toBeGreaterThan(0);
  }, 15000);

  it('Stress 2: Rapid flip-flop favorite mutation during simultaneous reads', async () => {
    const songId = 42;
    cache.set(songId, createAdversarialSong(songId, { isAFavorite: false }));

    let stopped = false;
    const readerPromise = (async () => {
      let readCount = 0;
      while (!stopped) {
        const item = cache.get(songId);
        expect(item).toBeDefined();
        expect(typeof item?.isAFavorite).toBe('boolean');
        readCount++;
        await new Promise((r) => setTimeout(r, 0));
      }
      return readCount;
    })();

    // Perform 1000 rapid synchronous favorite flips
    for (let i = 0; i < 1000; i++) {
      cache.updateFavorite(songId, i % 2 === 0);
    }

    stopped = true;
    const totalReads = await readerPromise;
    expect(totalReads).toBeGreaterThan(0);
    // Final state check: i=999 was false
    expect(cache.get(songId)?.isAFavorite).toBe(false);
  });
});

describe('Adversarial Stress Harness: Cache Eviction & Capacity Thrashing', () => {
  it('Stress 3: Strict LRU boundary verification with alternating and cyclic access patterns', () => {
    const capacity = 5;
    const smallCache = new SongMetadataCache(capacity);

    // Fill capacity with keys 1..5
    for (let i = 1; i <= 5; i++) {
      smallCache.set(i, createAdversarialSong(i));
    }
    expect(smallCache.size()).toBe(5);

    // Access order: 1, 3, 5 -> Current LRU (oldest to newest): 2, 4, 1, 3, 5
    smallCache.get(1);
    smallCache.get(3);
    smallCache.get(5);

    // Insert key 6 -> must evict key 2 (least recently used)
    smallCache.set(6, createAdversarialSong(6));
    expect(smallCache.has(2)).toBe(false);
    expect(smallCache.has(4)).toBe(true);
    expect(smallCache.has(1)).toBe(true);
    expect(smallCache.has(3)).toBe(true);
    expect(smallCache.has(5)).toBe(true);
    expect(smallCache.has(6)).toBe(true);
    expect(smallCache.size()).toBe(5);

    // Insert key 7 -> must evict key 4
    smallCache.set(7, createAdversarialSong(7));
    expect(smallCache.has(4)).toBe(false);
    expect(smallCache.has(7)).toBe(true);
    expect(smallCache.size()).toBe(5);

    // Re-insert existing key 1 with updated data -> should refresh recency without evicting anything
    smallCache.set(1, createAdversarialSong(1, { title: 'Refreshed 1' }));
    expect(smallCache.size()).toBe(5);
    expect(smallCache.get(1)?.title).toBe('Refreshed 1');

    // Current LRU: 3, 5, 6, 7, 1 -> Insert key 8 -> must evict key 3
    smallCache.set(8, createAdversarialSong(8));
    expect(smallCache.has(3)).toBe(false);
    expect(smallCache.has(1)).toBe(true);
  });

  it('Stress 4: High-frequency capacity thrashing over 10x capacity window', () => {
    const CAPACITY = 50;
    const thrashCache = new SongMetadataCache(CAPACITY);
    const TOTAL_KEYS = 500; // 10x capacity

    // Continuously cycle through keys 1..500 for 10 full loops
    for (let loop = 0; loop < 10; loop++) {
      for (let i = 1; i <= TOTAL_KEYS; i++) {
        thrashCache.set(i, createAdversarialSong(i));
        expect(thrashCache.size()).toBeLessThanOrEqual(CAPACITY);
      }
    }

    // At the end, cache must hold exactly the last 50 keys (451..500)
    expect(thrashCache.size()).toBe(CAPACITY);
    for (let i = 1; i <= 450; i++) {
      expect(thrashCache.has(i)).toBe(false);
    }
    for (let i = 451; i <= 500; i++) {
      expect(thrashCache.has(i)).toBe(true);
    }
  });
});

describe('Adversarial Stress Harness: Extreme Inputs & Malformed Data', () => {
  let cache: SongMetadataCache;

  beforeEach(() => {
    cache = new SongMetadataCache(500);
  });

  it('Stress 5: Extreme and unusual IDs (negative, zero, floating, duplicate, sparse)', () => {
    const specialSong0 = createAdversarialSong(0, { title: 'Zero ID Song' });
    const specialSongNeg = createAdversarialSong(-100, { title: 'Negative ID Song' });

    cache.set(0, specialSong0);
    cache.set(-100, specialSongNeg);

    expect(cache.has(0)).toBe(true);
    expect(cache.get(0)?.title).toBe('Zero ID Song');
    expect(cache.has(-100)).toBe(true);
    expect(cache.get(-100)?.title).toBe('Negative ID Song');

    // Batch getMany with duplicate and negative IDs
    const { hits, misses } = cache.getMany([0, 0, -100, -100, -200, 9999]);
    expect(hits.size).toBe(2);
    expect(hits.get(0)?.title).toBe('Zero ID Song');
    expect(hits.get(-100)?.title).toBe('Negative ID Song');
    // Misses must be deduplicated
    expect(misses).toEqual([-200, 9999]);

    // Invalidate negative ID
    cache.invalidate(-100);
    expect(cache.has(-100)).toBe(false);
  });

  it('Stress 6: Resilience against corrupted or malformed SQL JSON database rows in mapRawFlatRowToSongData', () => {
    // 1. Corrupted artists_json
    const corruptedArtistsRow: RawFlatSongRow = {
      id: 1,
      title: 'Corrupted Artists',
      duration: 200,
      path: 'C:\\song.mp3',
      year: 2020,
      trackNo: 1,
      discNo: 1,
      bitrate: 320,
      sampleRate: 44100,
      noOfChannels: 2,
      language: 'en',
      musicBrainzId: null,
      isAFavorite: 1,
      isBlacklisted: 0,
      createdAt: '2026-01-01',
      updatedAt: null,
      fileCreatedAt: null,
      fileModifiedAt: null,
      album_json: null,
      artists_json: '{invalid json, not an array',
      artworks_json: null,
      language_override: null
    };

    const song1 = mapRawFlatRowToSongData(corruptedArtistsRow);
    expect(song1.songId).toBe(1);
    expect(song1.artists).toEqual([]); // Fallback to empty array safely

    // 2. Malformed album_json (array instead of object, or missing required fields)
    const malformedAlbumRow: RawFlatSongRow = {
      ...corruptedArtistsRow,
      id: 2,
      artists_json: '[{"artistId": 10, "name": "Valid Artist"}, {"artistId": "invalid", "name": 123}]',
      album_json: '["not", "an", "object"]',
      artworks_json: '[{"path": "art1.jpg", "isOptimized": 1}, {"invalid": true}]'
    };

    const song2 = mapRawFlatRowToSongData(malformedAlbumRow);
    expect(song2.songId).toBe(2);
    // Invalid artist entry filtered out safely
    expect(song2.artists).toEqual([{ artistId: 10, name: 'Valid Artist' }]);
    // Malformed album JSON rejected safely
    expect(song2.album).toBeUndefined();
    // Valid artwork extracted safely
    expect(song2.isArtworkAvailable).toBe(true);
    expect(song2.artworkPaths.artworkPath).toContain('art1.jpg');

    // 3. Null and undefined fields across all columns
    const emptyRow: RawFlatSongRow = {
      id: 3,
      title: (null as any),
      duration: (null as any),
      path: (null as any),
      year: null,
      trackNo: null,
      discNo: null,
      bitrate: null,
      sampleRate: null,
      noOfChannels: null,
      language: null,
      musicBrainzId: null,
      isAFavorite: 0,
      isBlacklisted: 0,
      createdAt: null,
      updatedAt: null,
      fileCreatedAt: null,
      fileModifiedAt: null,
      album_json: '',
      artists_json: '',
      artworks_json: '',
      language_override: '   ' // Whitespace override should fallback to undefined
    };

    const song3 = mapRawFlatRowToSongData(emptyRow);
    expect(song3.songId).toBe(3);
    expect(song3.title).toBe('');
    expect(song3.duration).toBe(0);
    expect(song3.language).toBeUndefined();
    expect(song3.album).toBeUndefined();
    expect(song3.artists).toEqual([]);
    expect(song3.isArtworkAvailable).toBe(false);
  });
});

describe('Adversarial Stress Harness: Large-Scale Chunking & SQLite Boundaries', () => {
  let engine: SqliteEngine;

  beforeEach(() => {
    engine = openSqliteEngine(':memory:');
    const now = new Date('2026-01-01T12:00:00Z').toISOString();

    engine.run(
      `INSERT INTO music_folders (id, name, path, folder_created_at, last_modified_at, last_changed_at, last_parsed_at)
       VALUES (1, 'Adv Music', 'C:\\Music', ?, ?, ?, ?)`,
      [now, now, now, now]
    );

    // Seed 1,500 songs in SQLite
    engine.run('BEGIN TRANSACTION');
    for (let i = 1; i <= 1500; i++) {
      engine.run(
        `INSERT INTO songs (id, title, duration, path, folder_id, is_favorite, is_blacklisted, track_number, year, file_created_at, file_modified_at, created_at)
         VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?, ?, ?, ?)`,
        [i, `Song ${i}`, 180, `C:\\Music\\s_${i}.mp3`, (i % 12) + 1, 2020, now, now, now]
      );
    }
    engine.run('COMMIT');
  });

  afterAll(async () => {
    if (engine) await engine.close();
  });

  it('Stress 7: Queries > 1,000 IDs across multiple 500-item chunks with preserveIdOrder and duplicate sequences', () => {
    // Request 1,200 IDs with out-of-order, duplicates, and non-existent IDs
    const requestedIds: number[] = [];
    for (let i = 1200; i >= 1; i--) {
      requestedIds.push(i);
      if (i % 5 === 0) {
        requestedIds.push(i); // duplicate
      }
    }
    requestedIds.push(99999); // non-existent ID
    requestedIds.push(-5); // negative ID

    const results = executeFlatSongProjection(engine, requestedIds, { preserveIdOrder: true });

    // 1200 items + 240 duplicates = 1440 valid items found
    expect(results.length).toBe(1440);
    expect(results[0].songId).toBe(1200);
    expect(results[1].songId).toBe(1200); // duplicate sequence preserved
    expect(results[results.length - 1].songId).toBe(1);
  });
});
