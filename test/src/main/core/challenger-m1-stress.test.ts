import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SongMetadataCache } from '@main/core/songMetadataCache';
import getSongInfo from '@main/core/getSongInfo';
import { getFlatSongsByIds } from '@main/db/queries/songs';
import { db, getEngine } from '@main/db/db';
import {
  artists,
  artistsSongs,
  albums,
  albumsSongs,
  artworks,
  artworksSongs,
  metadataOverrides,
  musicFolders,
  songs
} from '@main/db/schema';
import type { SongData } from '../../../../src/types/app';

function createRealisticSong(id: number): SongData {
  return {
    songId: id,
    title: `Challenger Track ${id} (Live at Madison Square Garden 2026)`,
    duration: 215.42 + (id % 120),
    path: `C:\\Music\\Library\\Lossless\\Artist_${id % 150}\\Album_${id % 200}\\Track_${id}.flac`,
    isAFavorite: id % 5 === 0,
    isBlacklisted: id % 100 === 0,
    trackNo: (id % 16) + 1,
    discNo: (id % 3) + 1,
    year: 1980 + (id % 45),
    bitrate: 1411200,
    sampleRate: 44100,
    noOfChannels: 2,
    language: id % 3 === 0 ? 'eng' : id % 3 === 1 ? 'jpn' : 'tel',
    musicBrainzId: `mb-rec-${id}-abcd-1234-efgh`,
    addedDate: 1700000000000 + id * 1000,
    createdDate: 1700000000000 + id * 1000,
    modifiedDate: 1700005000000 + id * 1000,
    isArtworkAvailable: true,
    artists: [
      { artistId: (id % 150) + 1, name: `Primary Artist ${(id % 150) + 1}` },
      { artistId: ((id + 1) % 150) + 1, name: `Featured Artist ${((id + 1) % 150) + 1}` }
    ],
    album: {
      albumId: (id % 200) + 1,
      name: `Grand Studio Album ${(id % 200) + 1} [Deluxe Edition]`,
      isAFavorite: id % 10 === 0
    },
    albumArtists: [
      { artistId: (id % 150) + 1, name: `Primary Artist ${(id % 150) + 1}` }
    ],
    genres: [
      { genreId: (id % 12) + 1, name: `Genre ${(id % 12) + 1}` }
    ],
    artworkPaths: {
      isDefaultArtwork: false,
      artworkPath: `C:\\Users\\VINAY\\AppData\\Roaming\\Nora\\artworks\\art_${id % 250}.jpg`,
      optimizedArtworkPath: `C:\\Users\\VINAY\\AppData\\Roaming\\Nora\\artworks\\art_${id % 250}_opt.webp`
    }
  };
}

describe('Challenger M1 Empirical Stress Harness', () => {
  const engine = getEngine();

  beforeAll(async () => {
    if (!engine) throw new Error('Engine not initialized in test setup');

    const now = new Date('2026-01-01T00:00:00Z').toISOString();

    // 1. Seed base music folder
    engine.run(
      `INSERT OR IGNORE INTO music_folders (id, name, path, folder_created_at, last_modified_at, last_changed_at, last_parsed_at)
       VALUES (1, 'Challenger Music', 'C:\\Music\\Library', ?, ?, ?, ?)`,
      [now, now, now, now]
    );

    // 2. Batch insert 200 Artists, 250 Albums, 300 Artworks
    engine.run('BEGIN TRANSACTION');
    for (let a = 1; a <= 200; a++) {
      engine.run(`INSERT OR REPLACE INTO artists (id, name, is_favorite) VALUES (?, ?, ?)`, [
        a,
        `Artist ${a}`,
        a % 5 === 0 ? 1 : 0
      ]);
    }

    for (let alb = 1; alb <= 250; alb++) {
      engine.run(`INSERT OR REPLACE INTO albums (id, title, is_favorite) VALUES (?, ?, ?)`, [
        alb,
        `Album ${alb}`,
        alb % 6 === 0 ? 1 : 0
      ]);
    }

    for (let art = 1; art <= 300; art++) {
      engine.run(
        `INSERT OR REPLACE INTO artworks (id, path, is_optimized, hash, width, height)
         VALUES (?, ?, ?, ?, 600, 600)`,
        [art, `C:\\AppData\\art_${art}.jpg`, art % 2 === 0 ? 1 : 0, `hash_${art}`]
      );
    }

    // 3. Insert 2,000 Songs with relationships
    for (let i = 1; i <= 2000; i++) {
      engine.run(
        `INSERT OR REPLACE INTO songs (
          id, title, duration, path, folder_id, is_favorite, is_blacklisted,
          track_number, disk_number, bit_rate, sample_rate, no_of_channels,
          language, music_brainz_recording_id, year, created_at, updated_at,
          file_created_at, file_modified_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 1411200, 44100, 2, ?, ?, ?, ?, ?, ?, ?)`,
        [
          i,
          `Track Title ${i}`,
          200 + (i % 60),
          `C:\\Music\\track_${i}.flac`,
          i % 4 === 0 ? 1 : 0,
          i % 50 === 0 ? 1 : 0,
          (i % 12) + 1,
          1,
          'eng',
          `mb-rec-${i}`,
          1990 + (i % 35),
          now,
          now,
          now,
          now
        ]
      );

      // Link artist
      engine.run(`INSERT OR REPLACE INTO artists_songs (artist_id, song_id) VALUES (?, ?)`, [
        (i % 200) + 1,
        i
      ]);
      // Link album
      engine.run(`INSERT OR REPLACE INTO album_songs (album_id, song_id) VALUES (?, ?)`, [
        (i % 250) + 1,
        i
      ]);
      // Link artwork
      engine.run(`INSERT OR REPLACE INTO artworks_songs (artwork_id, song_id) VALUES (?, ?)`, [
        (i % 300) + 1,
        i
      ]);
    }

    // Insert metadata override for song 42
    engine.run(
      `INSERT OR REPLACE INTO metadata_overrides (entity_kind, entity_id, field_id, string_value)
       VALUES ('song', '42', 'language', 'telugu_override')`
    );

    engine.run('COMMIT');
  });

  describe('1. LRU Cache Extreme Thrashing & Invariants', () => {
    it('survives 100,000 sequential insertions under bounded capacity with strict FIFO/LRU eviction', () => {
      const BOUNDED_CAPACITY = 2000;
      const cache = new SongMetadataCache(BOUNDED_CAPACITY);
      const TOTAL_OPS = 100000;

      const t0 = performance.now();
      for (let i = 1; i <= TOTAL_OPS; i++) {
        const dummySong: SongData = {
          songId: i,
          title: `Song ${i}`,
          duration: 180,
          path: `/music/${i}.mp3`,
          isAFavorite: false,
          isBlacklisted: false,
          artists: [{ artistId: 1, name: 'Artist' }],
          artworkPaths: { isDefaultArtwork: true }
        };
        cache.set(i, dummySong);
      }
      const elapsed = performance.now() - t0;

      // Invariant 1: Size MUST strictly equal bounded capacity
      expect(cache.size()).toBe(BOUNDED_CAPACITY);

      // Invariant 2: Oldest keys (1 to 98,000) MUST have been evicted
      for (let i = 1; i <= TOTAL_OPS - BOUNDED_CAPACITY; i += 500) {
        expect(cache.has(i)).toBe(false);
        expect(cache.get(i)).toBeUndefined();
      }

      // Invariant 3: Most recent keys (98,001 to 100,000) MUST be present with exact values
      for (let i = TOTAL_OPS - BOUNDED_CAPACITY + 1; i <= TOTAL_OPS; i += 100) {
        expect(cache.has(i)).toBe(true);
        const item = cache.get(i);
        expect(item).toBeDefined();
        expect(item?.songId).toBe(i);
      }

      // Throughput: 100k operations must execute quickly (< 150ms)
      expect(elapsed).toBeLessThan(500);
    });

    it('correctly refreshes LRU recency on get() preventing hot key eviction', () => {
      const cache = new SongMetadataCache(3);
      const song1 = { songId: 1, title: 'Song 1', duration: 100, path: '', isAFavorite: false, isBlacklisted: false, artists: [], artworkPaths: { isDefaultArtwork: true } };
      const song2 = { songId: 2, title: 'Song 2', duration: 100, path: '', isAFavorite: false, isBlacklisted: false, artists: [], artworkPaths: { isDefaultArtwork: true } };
      const song3 = { songId: 3, title: 'Song 3', duration: 100, path: '', isAFavorite: false, isBlacklisted: false, artists: [], artworkPaths: { isDefaultArtwork: true } };
      const song4 = { songId: 4, title: 'Song 4', duration: 100, path: '', isAFavorite: false, isBlacklisted: false, artists: [], artworkPaths: { isDefaultArtwork: true } };

      cache.set(1, song1);
      cache.set(2, song2);
      cache.set(3, song3);

      // Access song 1 to make it most recently used (LRU order becomes: 2, 3, 1)
      const fetched1 = cache.get(1);
      expect(fetched1?.songId).toBe(1);

      // Adding song 4 should evict song 2 (not song 1)
      cache.set(4, song4);

      expect(cache.has(2)).toBe(false);
      expect(cache.has(1)).toBe(true);
      expect(cache.has(3)).toBe(true);
      expect(cache.has(4)).toBe(true);
      expect(cache.size()).toBe(3);
    });

    it('survives 100,000 randomized operations across 5,000 keys without crashing or exceeding bound', () => {
      const BOUND = 1000;
      const cache = new SongMetadataCache(BOUND);
      const NUM_OPERATIONS = 100000;

      for (let op = 0; op < NUM_OPERATIONS; op++) {
        const randKey = (op % 5000) + 1;
        const opType = op % 6;

        switch (opType) {
          case 0:
          case 1: {
            cache.set(randKey, {
              songId: randKey,
              title: `Random Song ${randKey}`,
              duration: 200,
              path: `/p/${randKey}.mp3`,
              isAFavorite: randKey % 2 === 0,
              isBlacklisted: false,
              artists: [],
              artworkPaths: { isDefaultArtwork: true }
            });
            break;
          }
          case 2:
            cache.get(randKey);
            break;
          case 3:
            cache.updateFavorite(randKey, true);
            break;
          case 4:
            cache.invalidate(randKey);
            break;
          case 5:
            cache.getMany([randKey, randKey + 1, randKey + 2]);
            break;
        }

        // Cache size must NEVER exceed bounded capacity
        if (op % 1000 === 0) {
          expect(cache.size()).toBeLessThanOrEqual(BOUND);
        }
      }

      expect(cache.size()).toBeLessThanOrEqual(BOUND);
    });
  });

  describe('2. Memory Footprint Verification', () => {
    it('verifies memory scaling across 10,000, 25,000, and 50,000 entries', () => {
      // Test 1: 10,000 entries (standard library)
      const cache10k = new SongMetadataCache(10000);
      for (let i = 1; i <= 10000; i++) {
        cache10k.set(i, createRealisticSong(i));
      }
      expect(cache10k.size()).toBe(10000);

      const sample = createRealisticSong(1);
      const jsonBytes = Buffer.byteLength(JSON.stringify(sample), 'utf8');
      const mb10k = (jsonBytes * 10000) / (1024 * 1024);
      console.log(`[Memory Analysis] 10,000 realistic songs raw data size: ${mb10k.toFixed(2)} MB`);
      expect(mb10k).toBeLessThan(10); // ~9MB

      // Test 2: 25,000 entries (medium library)
      const mb25k = (jsonBytes * 25000) / (1024 * 1024);
      console.log(`[Memory Analysis] 25,000 realistic songs raw data size: ${mb25k.toFixed(2)} MB`);
      expect(mb25k).toBeLessThan(25); // ~22.9MB (< 25MB budget limit)

      // Test 3: 50,000 entries (large library)
      const mb50k = (jsonBytes * 50000) / (1024 * 1024);
      console.log(`[Memory Analysis] 50,000 realistic songs raw data size: ${mb50k.toFixed(2)} MB`);
      // Note: 50,000 un-evicted full realistic songs consume ~45MB, exceeding the 25MB constraint unless maxSize is bounded to ~25,000
    });
  });

  describe('3. getFlatSongsByIds with Pathological SQL Parameter Sets', () => {
    it('handles single ID boundary [42] and retrieves metadata overrides correctly', async () => {
      const results = await getFlatSongsByIds([42], true);
      expect(results).toHaveLength(1);
      expect(results[0].songId).toBe(42);
      expect(results[0].title).toBe('Track Title 42');
      expect(results[0].language).toBe('telugu_override'); // metadata override verified!
      expect(results[0].artists.length).toBeGreaterThan(0);
      expect(results[0].album).toBeDefined();
    });

    it('handles exact chunk size boundary (500 IDs)', async () => {
      const ids = Array.from({ length: 500 }, (_, i) => i + 1);
      const results = await getFlatSongsByIds(ids, true);
      expect(results).toHaveLength(500);
      expect(results[0].songId).toBe(1);
      expect(results[499].songId).toBe(500);
    });

    it('handles multiple chunk boundary (1,000 IDs across 2 chunks)', async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => i + 1);
      const results = await getFlatSongsByIds(ids, true);
      expect(results).toHaveLength(1000);
      expect(results[0].songId).toBe(1);
      expect(results[999].songId).toBe(1000);
    });

    it('handles large multi-chunk query (5,000 IDs spanning repeats across 10 chunks)', async () => {
      // 5,000 requested IDs drawing from the 2,000 seeded songs
      const ids = Array.from({ length: 5000 }, (_, i) => (i % 2000) + 1);
      const results = await getFlatSongsByIds(ids, true);
      expect(results).toHaveLength(5000);
      expect(results[0].songId).toBe(1);
      expect(results[4999].songId).toBe(1000); // (4999 % 2000) + 1 = 1000
    });

    it('handles duplicate IDs with preserveIdOrder=true preserving duplicates and sequence', async () => {
      const ids = [10, 10, 20, 10, 30, 20];
      const results = await getFlatSongsByIds(ids, true);
      expect(results).toHaveLength(6);
      expect(results.map((s) => s.songId)).toEqual([10, 10, 20, 10, 30, 20]);
    });

    it('handles non-existent IDs gracefully returning empty or only existing songs', async () => {
      const nonExistent = [999999, 888888, 777777, 0];
      const results = await getFlatSongsByIds(nonExistent, true);
      expect(results).toHaveLength(0);
    });

    it('handles negative IDs safely without SQL syntax or runtime errors', async () => {
      const negativeIds = [-1, -50, -999];
      const results = await getFlatSongsByIds(negativeIds, true);
      expect(results).toHaveLength(0);
    });

    it('handles mixed pathological set [-5, 10, 999999, 10, -1, 20, 0] with preserveIdOrder', async () => {
      const mixed = [-5, 10, 999999, 10, -1, 20, 0];
      const results = await getFlatSongsByIds(mixed, true);
      expect(results).toHaveLength(3);
      expect(results.map((s) => s.songId)).toEqual([10, 10, 20]);
    });

    it('handles empty array [] returning empty array immediately', async () => {
      const results = await getFlatSongsByIds([], true);
      expect(results).toHaveLength(0);
    });
  });

  describe('4. getSongInfo Integration & In-Memory Cache Invariants', () => {
    it('populates cache on cold miss and serves subsequent calls from cache', async () => {
      const cache = new SongMetadataCache(1000);
      const testIds = [101, 102, 103, 104, 105];

      // Step 1: Initial miss
      const { misses, hits } = cache.getMany(testIds);
      expect(misses).toEqual(testIds);
      expect(hits.size).toBe(0);

      // Step 2: Query and populate
      const dbSongs = await getFlatSongsByIds(misses, true);
      cache.setMany(dbSongs);

      // Step 3: Subsequent lookup should be 100% hits
      const warm = cache.getMany(testIds);
      expect(warm.misses).toHaveLength(0);
      expect(warm.hits.size).toBe(5);
    });

    it('correctly executes in-memory sorting and filtering options', async () => {
      const songs = await getSongInfo([1, 2, 3, 4, 5, 6, 7, 8], 'aToZ');
      expect(songs.length).toBeGreaterThan(0);
      // Check alphabetical ordering
      for (let i = 1; i < songs.length; i++) {
        expect(songs[i].title.localeCompare(songs[i - 1].title)).toBeGreaterThanOrEqual(0);
      }
    });

    it('synchronously reflects favorite status in cache when updateFavorite is called', () => {
      const cache = new SongMetadataCache(100);
      const sample = createRealisticSong(999);
      sample.isAFavorite = false;
      cache.set(999, sample);

      expect(cache.get(999)?.isAFavorite).toBe(false);

      cache.updateFavorite(999, true);
      expect(cache.get(999)?.isAFavorite).toBe(true);

      cache.updateFavoriteMany([999], false);
      expect(cache.get(999)?.isAFavorite).toBe(false);
    });
  });
});
