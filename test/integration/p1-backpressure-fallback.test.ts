import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'path';

import * as schema from '@main/db/schema';
import { musicFolders, songs } from '@main/db/schema';

vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn().mockResolvedValue({
    existing: undefined,
    payloads: undefined
  }),
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

vi.mock('@main/parseSong/parseSong', () => ({
  tryToParseSong: vi.fn(async (songPath: string, folderId?: number) => {
    const [inserted] = await db.insert(songs).values({
      title: path.basename(songPath),
      duration: 180,
      path: songPath,
      folderId,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    }).returning();

    return {
      songData: inserted,
      relevantAlbum: undefined,
      newAlbum: undefined,
      newArtists: [],
      relevantArtists: [],
      newGenres: [],
      relevantGenres: [],
      relevantAlbumArtists: [],
      newAlbumArtists: []
    };
  })
}));

import { db } from '@main/db/db';
import { processSongsWithWorkerPool, type SongPoolInput } from '@main/core/songWorkerPool';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';

describe('Item 3/5 FORENSIC: Worker Backpressure Timeout & Durable Cursor Fallback', () => {
  let rootFolderId: number;

  beforeAll(async () => {
  });

  beforeEach(async () => {
    await db.delete(songs);
    await db.delete(musicFolders);

    const [folder] = await db.insert(musicFolders).values({
      name: 'TestMusic',
      path: '/mock/music'
    }).returning();
    rootFolderId = folder.id;
  });

  function makeSongPoolInput(index: number): SongPoolInput {
    return {
      songPath: `/mock/music/track_${index.toString().padStart(3, '0')}.mp3`,
      folderId: rootFolderId
    };
  }

  it('Worker Timeout on Batch 2: Batch 1 committed -> Worker times out -> Fallback processes Batch 2 & 3 -> 0 tracks lost, 0 duplicates', async () => {
    // 150 songs total = 3 batches of 50
    const songList: SongPoolInput[] = Array.from({ length: 150 }, (_, i) => makeSongPoolInput(i));

    // Mock MediaWorkerBridge parseTrackBatchStream to simulate Batch 1 success + Batch 2 backpressure timeout
    vi.spyOn(mediaWorkerBridge, 'isReady').mockReturnValue(true);
    vi.spyOn(mediaWorkerBridge, 'parseTrackBatchStream').mockImplementation(async (songsToParse, options) => {
      // 1. Deliver Batch 1 (songs 0-49)
      const batch1Tracks = songsToParse.slice(0, 50).map((s, idx) => ({
        songPath: s.songPath,
        title: `Song ${idx}`,
        duration: 180,
        artists: ['Artist 1'],
        albumArtists: ['Artist 1'],
        album: 'Album 1',
        genres: ['Rock'],
        year: 2024,
        sampleRate: 44100,
        bitRate: 320000,
        noOfChannels: 2,
        diskNumber: 1,
        trackNumber: idx + 1,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date(),
        folderId: s.folderId
      }));

      await options.onBatch({
        batchId: 1,
        isLastBatch: false,
        tracks: batch1Tracks,
        errors: []
      });

      // 2. Simulate Worker Backpressure Timeout during Batch 2
      // Per P1-3 fix: MediaWorkerBridge rejects with typed cancellation error
      throw new Error(
        '[MediaWorkerBridge] Worker batch parsing was cancelled (timeout or worker failure). Committed 50 tracks before cancellation.'
      );
    });

    // Run batch ingestion
    const result = await processSongsWithWorkerPool(songList, undefined, undefined, 50);

    // Invariant Verification:
    // 1. Total success count matches 150
    expect(result.successCount).toBe(150);
    expect(result.errorCount).toBe(0);

    // 2. Exact database count
    const allDbSongs = await db.select().from(songs);
    expect(allDbSongs).toHaveLength(150);

    // 3. Verify ZERO duplicate paths
    const uniquePaths = new Set(allDbSongs.map((s) => s.path));
    expect(uniquePaths.size).toBe(150);

    // 4. Verify all 150 tracks from 0 to 149 exist in database
    for (let i = 0; i < 150; i++) {
      const expectedPath = `/mock/music/track_${i.toString().padStart(3, '0')}.mp3`;
      expect(uniquePaths.has(expectedPath)).toBe(true);
    }
  });

  it('User Cancellation: AbortSignal triggered -> Cancels both worker and local fallback promptly without runaways', async () => {
    const songList: SongPoolInput[] = Array.from({ length: 50 }, (_, i) => makeSongPoolInput(i));
    const abortController = new AbortController();

    vi.spyOn(mediaWorkerBridge, 'isReady').mockReturnValue(true);
    vi.spyOn(mediaWorkerBridge, 'parseTrackBatchStream').mockImplementation(async (songsToParse, options) => {
      abortController.abort();
      throw new Error('[MediaWorkerBridge] Aborted by user signal');
    });

    const result = await processSongsWithWorkerPool(songList, abortController.signal, undefined, 25);

    // When aborted by user, remaining songs are NOT processed by local fallback
    expect(result.successCount).toBe(0);
    const dbSongs = await db.select().from(songs);
    expect(dbSongs).toHaveLength(0);
  });
});
