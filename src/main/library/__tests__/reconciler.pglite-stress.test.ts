import path from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@main/db/schema';
import { musicFolders, songs } from '@main/db/schema';
import { LibraryReconciler } from '../LibraryReconciler';
import reParseSong from '../../parseSong/reParseSong';

vi.mock('@main/db/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');

  const client = await PGlite.create({ extensions: { pg_trgm, citext } });
  const db = drizzle(client, { schema });

  return { db, client };
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

import type { PGlite } from '@electric-sql/pglite';
import type { DB } from '@main/db/db';

let testDb: DB;

// Note: reParseSong is mocked to isolate and validate PGlite transaction concurrency
// and monotonic progress reporting under 8 concurrent reconciliation workers.
describe('LibraryReconciler PGlite transaction concurrency stress test', () => {
  beforeAll(async () => {
    const mockedModule = (await import('@main/db/db')) as unknown as { db: DB; client: PGlite };
    const { db, client } = mockedModule;
    testDb = db;

    await client.query(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    const migrationsFolder = path.resolve(__dirname, '../../../../resources/drizzle');
    await migrate(db, { migrationsFolder });

    // Seed root folder
    await db.insert(musicFolders).values({
      name: 'Music',
      path: 'C:\\Music',
      isBlacklisted: false
    });
  });

  it('should process 100 concurrent reconciliation operations with 8 workers under real PGlite transactions with zero surfaced errors', async () => {
    vi.mocked(reParseSong).mockImplementation(async (songPath: string) => {
      const fileName = path.basename(songPath, path.extname(songPath));
      await testDb.transaction(async (trx) => {
        await trx
          .update(songs)
          .set({
            title: `Updated_${fileName}`,
            duration: '240',
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
      duration: '180',
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

    // Invariant 3: Verify all 100 rows in PGlite DB have updated titles & durations
    const dbSongs = await testDb.select().from(songs);
    expect(dbSongs).toHaveLength(100);
    for (const song of dbSongs) {
      expect(song.title).toMatch(/^Updated_Track_\d+$/);
      expect(Number(song.duration)).toBe(240);
    }
  }, 20000);
});
