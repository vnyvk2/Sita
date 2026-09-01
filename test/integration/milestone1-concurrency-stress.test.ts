import { db } from '@main/db/db';
import {
  artists,
  artistsSongs,
  albums,
  albumsSongs,
  artworks,
  artworksSongs,
  scrobbleQueue,
  songs,
  userSettings
} from '@main/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

import getSongInfo from '../../src/main/core/getSongInfo';
import songMetadataCache from '../../src/main/core/songMetadataCache';
import toggleLikeSongs, { enqueueFavoritesSync } from '../../src/main/core/toggleLikeSongs';
import { updateSongBasicFields, removeSongById } from '../../src/main/db/queries/songs';
import {
  getCurrentLastFmGeneration,
  invalidateLastFmSession
} from '../../src/main/other/lastFm/flushScrobbleQueue';
import {
  getCurrentListenBrainzGeneration,
  invalidateListenBrainzSession
} from '../../src/main/other/listenBrainz/listenBrainzSession';

describe('Milestone 1 Concurrency & Stress Verification (Challenger 2)', () => {
  const TEST_SONG_COUNT = 60;
  const createdSongIds: number[] = [];
  let artistId: number;
  let albumId: number;
  let artworkId: number;

  beforeAll(async () => {
    // 1. Seed Artist, Album, Artwork
    const now = new Date();
    const runId = `c2_${Date.now()}`;

    const [art] = await db
      .insert(artists)
      .values({ name: `Challenger Artist ${runId}`, isFavorite: false })
      .returning({ id: artists.id });
    artistId = art.id;

    const [alb] = await db
      .insert(albums)
      .values({ title: `Challenger Album ${runId}`, isFavorite: false })
      .returning({ id: albums.id });
    albumId = alb.id;

    const [artw] = await db
      .insert(artworks)
      .values({
        path: `artworks/c2_${runId}.webp`,
        hash: `hash_${runId}`,
        isOptimized: true,
        width: 300,
        height: 300
      })
      .returning({ id: artworks.id });
    artworkId = artw.id;

    // 2. Batch insert 60 songs
    const songInserts = Array.from({ length: TEST_SONG_COUNT }, (_, i) => ({
      title: `Stress Track ${i + 1}`,
      path: `C:\\music\\c2_stress_${runId}_${i + 1}.mp3`,
      duration: 150 + (i % 100),
      year: 2020 + (i % 5),
      trackNumber: i + 1,
      isFavorite: i % 2 === 0, // Alternating initial favorite state
      isBlacklisted: i % 10 === 0,
      fileCreatedAt: now,
      fileModifiedAt: now
    }));

    const insertedSongs = await db.insert(songs).values(songInserts).returning({ id: songs.id });
    for (const s of insertedSongs) {
      createdSongIds.push(s.id);
    }

    // 3. Link junctions
    await db
      .insert(artistsSongs)
      .values(createdSongIds.map((songId) => ({ artistId, songId })));
    await db
      .insert(albumsSongs)
      .values(createdSongIds.map((songId) => ({ albumId, songId })));
    await db
      .insert(artworksSongs)
      .values(createdSongIds.map((songId) => ({ artworkId, songId })));
  });

  afterAll(async () => {
    songMetadataCache.clear();
    if (createdSongIds.length > 0) {
      await db.delete(artworksSongs).where(inArray(artworksSongs.songId, createdSongIds));
      await db.delete(albumsSongs).where(inArray(albumsSongs.songId, createdSongIds));
      await db.delete(artistsSongs).where(inArray(artistsSongs.songId, createdSongIds));
      await db.delete(scrobbleQueue).where(inArray(scrobbleQueue.songId, createdSongIds));
      await db.delete(songs).where(inArray(songs.id, createdSongIds));
    }
    if (artworkId) await db.delete(artworks).where(eq(artworks.id, artworkId));
    if (albumId) await db.delete(albums).where(eq(albums.id, albumId));
    if (artistId) await db.delete(artists).where(eq(artists.id, artistId));
  });

  beforeEach(() => {
    songMetadataCache.clear();
  });

  // =========================================================================
  // MISSION 1: Concurrent favorites mutation while querying getSongInfo
  // =========================================================================
  describe('Mission 1: High-Concurrency Mutations & Overlapping Batch Queries', () => {
    it('executes 40 concurrent mutation and query tasks across overlapping ID batches without errors or race corruption', async () => {
      // Split song IDs into overlapping batches
      const batchA = createdSongIds.slice(0, 25);
      const batchB = createdSongIds.slice(15, 40);
      const batchC = createdSongIds.slice(30, 55);
      const batchD = createdSongIds.slice(20, 50);

      const tasks: Promise<unknown>[] = [];

      // 10 concurrent mutation tasks
      for (let i = 0; i < 10; i++) {
        const batch = [batchA, batchB, batchC, batchD][i % 4];
        if (i % 3 === 0) {
          tasks.push(toggleLikeSongs(batch, true));
        } else if (i % 3 === 1) {
          tasks.push(toggleLikeSongs(batch, false));
        } else {
          tasks.push(toggleLikeSongs(batch)); // inverting
        }
      }

      // 30 concurrent query tasks with various flags
      for (let i = 0; i < 30; i++) {
        const batch = [batchA, batchB, batchC, batchD][i % 4];
        const preserveOrder = i % 2 === 0;
        const filter: SongFilterTypes | undefined =
          i % 3 === 0 ? 'favorites' : i % 3 === 1 ? 'nonFavorites' : undefined;
        tasks.push(
          getSongInfo(batch, undefined, filter, undefined, preserveOrder).then((res) => {
            // Verify internal consistency of query result
            if (filter === 'favorites') {
              for (const song of res) {
                expect(song.isAFavorite).toBe(true);
              }
            } else if (filter === 'nonFavorites') {
              for (const song of res) {
                expect(song.isAFavorite).toBe(false);
              }
            }
            if (preserveOrder && !filter) {
              const resIds = res.map((s) => s.songId);
              expect(resIds).toEqual(batch);
            }
            return res;
          })
        );
      }

      // Execute all 40 concurrent operations simultaneously
      const results = await Promise.all(tasks);
      expect(results).toHaveLength(40);

      // Verify that after settling, SongMetadataCache matches DB state for all 60 songs
      const dbSongs = await db
        .select({ id: songs.id, isFavorite: songs.isFavorite })
        .from(songs)
        .where(inArray(songs.id, createdSongIds));
      const dbStateMap = new Map(dbSongs.map((s) => [s.id, s.isFavorite]));

      // Query full cache
      const finalHydration = await getSongInfo(createdSongIds, undefined, undefined, undefined, true);
      expect(finalHydration).toHaveLength(createdSongIds.length);

      for (const song of finalHydration) {
        const expectedFavorite = dbStateMap.get(song.songId);
        expect(song.isAFavorite).toBe(expectedFavorite);
      }
    });

    it('interleaves cold cache misses, rapid background mutations, and second-stage cache hits without stale returns', async () => {
      const targetIds = createdSongIds.slice(0, 10);
      songMetadataCache.clear();

      // Cold query 1 (fires getFlatSongsByIds)
      const pQuery1 = getSongInfo(targetIds, undefined, undefined, undefined, true);

      // Concurrent mutation on targetIds[0] and targetIds[1]
      const pMutate = toggleLikeSongs([targetIds[0], targetIds[1]], true);

      // Cold query 2 for overlapping subset [0..4]
      const pQuery2 = getSongInfo(targetIds.slice(0, 5), undefined, undefined, undefined, true);

      await Promise.all([pQuery1, pMutate, pQuery2]);

      // Ensure cache now has valid items and targetIds[0], targetIds[1] reflect true
      const check1 = songMetadataCache.get(targetIds[0]);
      const check2 = songMetadataCache.get(targetIds[1]);

      expect(check1?.isAFavorite).toBe(true);
      expect(check2?.isAFavorite).toBe(true);
    });
  });

  // =========================================================================
  // MISSION 2: Order preservation, duplicates, and invalidation consistency
  // =========================================================================
  describe('Mission 2: SongMetadataCache Order Invariants & Mutation Invalidation', () => {
    it('preserves exact requested order with duplicate IDs, arbitrary permutations, and missing IDs', async () => {
      const [id1, id2, id3, id4] = createdSongIds;
      const nonExistentId = 99999999;

      // Warm up cache for id1 and id2
      await getSongInfo([id1, id2]);

      // Request order: [id3 (cold), id1 (warm), id4 (cold), id1 (warm), nonExistentId, id2 (warm), id3 (now warm)]
      const requested = [id3, id1, id4, id1, nonExistentId, id2, id3];
      const result = await getSongInfo(requested, undefined, undefined, undefined, true);

      // Should return exact requested sequence filtering out only nonExistentId
      expect(result.map((s) => s.songId)).toEqual([id3, id1, id4, id1, id2, id3]);
      expect(result).toHaveLength(6);
    });

    it('invalidates cache correctly on updateSongBasicFields and serves updated metadata on next getSongInfo', async () => {
      const targetId = createdSongIds[5];

      // 1. Hydrate into cache
      const [initial] = await getSongInfo([targetId]);
      expect(initial.title).toBe('Stress Track 6');

      // 2. Mutate in DB (which triggers songMetadataCache.invalidate)
      await updateSongBasicFields(targetId, { title: 'Updated Stress Track 6 (Remastered)' });
      expect(songMetadataCache.has(targetId)).toBe(false);

      // 3. Query getSongInfo again
      const [updated] = await getSongInfo([targetId]);
      expect(updated.title).toBe('Updated Stress Track 6 (Remastered)');
      expect(songMetadataCache.has(targetId)).toBe(true);
    });

    it('invalidates cache correctly on removeSongById', async () => {
      const targetId = createdSongIds[TEST_SONG_COUNT - 1];

      // Hydrate into cache
      await getSongInfo([targetId]);
      expect(songMetadataCache.has(targetId)).toBe(true);

      // Delete
      await removeSongById(targetId);
      expect(songMetadataCache.has(targetId)).toBe(false);

      // Querying deleted ID returns empty
      const res = await getSongInfo([targetId]);
      expect(res).toHaveLength(0);
    });
  });

  // =========================================================================
  // MISSION 3: Last.fm & ListenBrainz Scrobble Queue Under Rapid Toggling
  // =========================================================================
  describe('Mission 3: Scrobble Queue Behavior During Rapid Favorite Toggling', () => {
    beforeAll(async () => {
      // Ensure user settings have Last.fm & ListenBrainz favorites sync enabled in DB
      const existingSettings = await db.select().from(userSettings).limit(1);
      if (existingSettings.length === 0) {
        await db.insert(userSettings).values({
          sendSongFavoritesDataToLastFM: true,
          sendSongFavoritesDataToListenBrainz: true
        });
      } else {
        await db
          .update(userSettings)
          .set({
            sendSongFavoritesDataToLastFM: true,
            sendSongFavoritesDataToListenBrainz: true
          })
          .where(eq(userSettings.id, existingSettings[0].id));
      }
    });

    it('handles 20 rapid alternating toggles on the same song preserving FIFO operation order', async () => {
      const targetId = createdSongIds[0];
      const initialQueueCount = (
        await db.select().from(scrobbleQueue).where(eq(scrobbleQueue.songId, targetId))
      ).length;

      // Perform 20 sequential toggles (like -> unlike -> like -> unlike...)
      for (let i = 0; i < 20; i++) {
        const isLike = i % 2 === 0;
        await toggleLikeSongs([targetId], isLike);
      }

      // Wait for serialization chain
      await enqueueFavoritesSync([], []);

      // Check scrobble_queue rows for this song
      const queuedRows = await db
        .select()
        .from(scrobbleQueue)
        .where(eq(scrobbleQueue.songId, targetId));

      const newRows = queuedRows.slice(initialQueueCount);

      // Each toggle triggers Last.fm + ListenBrainz -> 20 * 2 = 40 scrobble queue items
      expect(newRows.length).toBe(40);

      // Verify each row has valid metadata from SongMetadataCache / getFlatSongsByIds
      for (const row of newRows) {
        expect(row.trackTitle).toBe('Stress Track 1');
        expect(row.artistNames).toContain('Challenger Artist');
        expect(['track.love', 'track.unlove', 'listenbrainz.love', 'listenbrainz.unlove']).toContain(
          row.operationType
        );
      }

      // Verify FIFO ordering for Last.fm operations
      const lastFmOps = newRows
        .filter((r) => r.operationType.startsWith('track.'))
        .map((r) => r.operationType);
      expect(lastFmOps).toHaveLength(20);
      for (let i = 0; i < 20; i++) {
        const expectedOp = i % 2 === 0 ? 'track.love' : 'track.unlove';
        expect(lastFmOps[i]).toBe(expectedOp);
      }

      // Verify FIFO ordering for ListenBrainz operations
      const lbOps = newRows
        .filter((r) => r.operationType.startsWith('listenbrainz.'))
        .map((r) => r.operationType);
      expect(lbOps).toHaveLength(20);
      for (let i = 0; i < 20; i++) {
        const expectedOp = i % 2 === 0 ? 'listenbrainz.love' : 'listenbrainz.unlove';
        expect(lbOps[i]).toBe(expectedOp);
      }
    });

    it('discards stale scrobble sync when account generation advances during in-flight toggle', async () => {
      const targetId = createdSongIds[1];
      const initialQueueCount = (
        await db.select().from(scrobbleQueue).where(eq(scrobbleQueue.songId, targetId))
      ).length;

      // Start with current generation
      const oldLastFmGen = getCurrentLastFmGeneration();
      const oldLbGen = getCurrentListenBrainzGeneration();

      // Enqueue a favorite sync explicitly with old generation
      // But advance the generation immediately before it executes
      invalidateLastFmSession();
      invalidateListenBrainzSession();

      await enqueueFavoritesSync([targetId], [], oldLastFmGen, oldLbGen);

      // Scrobble queue count should NOT have increased because generations were invalidated
      const finalRows = await db
        .select()
        .from(scrobbleQueue)
        .where(eq(scrobbleQueue.songId, targetId));

      expect(finalRows.length).toBe(initialQueueCount);
    });
  });
});
