import path from 'path';

import { musicFolders, songs } from '@main/db/schema';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import reParseSong from '../../parseSong/reParseSong';
import { LibraryReconciler } from '../LibraryReconciler';

vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('../../../../test/helpers/sqliteMockDb');
  return createSqliteMockDb();
});

vi.mock('../../parseSong/reParseSong', () => ({
  default: vi.fn()
}));

vi.mock('@main/main', () => ({
  sendMessageToRenderer: vi.fn(),
  dataUpdateEvent: vi.fn()
}));

vi.mock('@main/core/songWorkerPool', () => ({
  songWorkerPool: vi.fn()
}));

import type { DB } from '@main/db/db';

let testDb: DB;

// Note: reParseSong is mocked to isolate and validate SQLite transaction concurrency
// and monotonic progress reporting under 8 concurrent reconciliation workers.
describe('LibraryReconciler SQLite transaction concurrency stress test', () => {
  beforeAll(async () => {
    const mockedModule = (await import('@main/db/db')) as unknown as { db: DB };
    testDb = mockedModule.db;
    // Baseline SQLite schema is applied by the engine on first open (:memory:)

    // Seed root folder
    await testDb.insert(musicFolders).values({
      name: 'Music',
      path: 'C:\\Music',
      isBlacklisted: false
    });
  });

  it('should process 100 concurrent reconciliation operations with 8 workers under real SQLite transactions with zero surfaced errors', async () => {
    vi.mocked(reParseSong).mockImplementation(async (songPath: string) => {
      const fileName = path.basename(songPath, path.extname(songPath));
      await testDb.transaction(async (trx) => {
        await trx
          .update(songs)
          .set({
            title: `Updated_${fileName}`,
            duration: 240,
            fileModifiedAt: new Date()
          })
          .where(eq(songs.path, songPath));
      });

      const mockSong: SongData = {
        songId: 1,
        title: `Updated_${fileName}`,
        artists: [],
        duration: 240,
        path: songPath,
        isAFavorite: false,
        isBlacklisted: false,
        isArtworkAvailable: false,
        addedDate: Date.now(),
        artworkPaths: {
          isDefaultArtwork: true,
          artworkPath: '',
          optimizedArtworkPath: ''
        }
      };
      return mockSong;
    });

    const songCount = 100;
    const initialRows = Array.from({ length: songCount }, (_, i) => ({
      title: `Track_${i}`,
      duration: 180,
      path: `C:\\Music\\Track_${i}.mp3`,
      folderId: 1,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date(1000)
    }));

    // Ingest 100 songs in batch
    await testDb.insert(songs).values(initialRows);

    const modifiedDiff = initialRows.map((row) => ({
      path: row.path,
      fileModifiedAt: new Date(2000),
      size: 5000000,
      rootId: 1,
      dirPath: 'C:\\Music'
    }));

    const progressReports: number[] = [];
    const reconciler = new LibraryReconciler();

    const result = await reconciler.reconcileModified(modifiedDiff, {
      concurrency: 8,
      onProgress: (progress) => {
        progressReports.push(progress.completed);
      }
    });

    // Invariant 1: All 100 songs completed with 0 errors
    expect(result.errors).toHaveLength(0);
    expect(result.successCount).toBe(100);

    // Invariant 2: Progress reported monotonically for all 100 items
    expect(progressReports).toHaveLength(100);
    for (let i = 0; i < progressReports.length; i++) {
      expect(progressReports[i]).toBe(i + 1);
    }

    // Invariant 3: Verify all 100 rows in SQLite DB have updated titles & durations
    const dbSongs = await testDb.select().from(songs);
    expect(dbSongs).toHaveLength(100);
    for (const song of dbSongs) {
      expect(song.title).toMatch(/^Updated_Track_\d+$/);
      expect(Number(song.duration)).toBe(240);
    }
  }, 20000);
});
