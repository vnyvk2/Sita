import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@main/db/schema';
import { musicFolders, songs } from '@main/db/schema';

// Mock DB with in-memory PGlite
vi.mock('@main/db/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const { citext } = await import('@electric-sql/pglite/contrib/citext');

  const client = await PGlite.create({ extensions: { pg_trgm, citext } });
  const db = drizzle(client, { schema });

  return { db, client };
});

vi.mock('@main/parseSong/parseSong', () => ({
  tryToParseSong: vi.fn(async (songPath: string, folderId?: number) => {
    const fileName = path.basename(songPath, path.extname(songPath));
    const [inserted] = await db.insert(songs).values({
      title: fileName,
      duration: '180',
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

vi.mock('@main/workers/jobScheduler', () => ({
  libraryScheduler: {
    enqueue: vi.fn(),
    requestMaintenance: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getRawMetrics: vi.fn(() => ({
      queuedJobs: 0,
      runningJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      concurrencyLimits: { interactive: 4, background: 2, maintenance: 1 }
    })),
    getRunningJobs: vi.fn(() => [])
  }
}));

import { client, db } from '@main/db/db';
import { diffFilesystemSnapshot, type DbSongSnapshot } from '../diffEngine';
import { fastDiskWalk } from '../fastDiskWalk';
import { LibraryReconciler } from '../LibraryReconciler';

describe('Scanner Pipeline End-to-End Integration (B-5b)', () => {
  let tempDir: string;
  let reconciler: LibraryReconciler;
  const rootId = 1;

  beforeAll(async () => {
    await client.query(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    const migrationsFolder = path.resolve(__dirname, '../../../../resources/drizzle');
    await migrate(db, { migrationsFolder });

    reconciler = new LibraryReconciler();
  });

  beforeEach(async () => {
    // Clean tables
    await db.delete(songs);
    await db.delete(musicFolders);

    // Create unique temp directory on disk
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-scanner-integration-'));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('Pipeline Step 1: Initial full scan discovers files, creates folders, and ingests songs into real DB', async () => {
    // 1. Setup real directories and files on disk
    const rockDir = path.join(tempDir, 'Rock');
    const popDir = path.join(tempDir, 'Pop');
    await fs.mkdir(rockDir, { recursive: true });
    await fs.mkdir(popDir, { recursive: true });

    const song1Path = path.join(rockDir, 'RockSong.mp3');
    const song2Path = path.join(popDir, 'PopSong.flac');
    await fs.writeFile(song1Path, 'dummy audio data');
    await fs.writeFile(song2Path, 'dummy audio data');

    // Create scan root in DB
    const [rootFolder] = await db.insert(musicFolders).values({
      path: tempDir,
      name: path.basename(tempDir) || 'Root',
      isScanRoot: true
    }).returning();

    const scanRoot = { id: rootFolder.id, path: tempDir };

    // 2. Execute fastDiskWalk on real filesystem
    const diskWalk = await fastDiskWalk([scanRoot]);
    expect(diskWalk.snapshots).toHaveLength(2);
    expect(diskWalk.failedSubtrees).toHaveLength(0);

    // 3. Diff against empty DB snapshot
    const dbSnapshots: DbSongSnapshot[] = [];
    const diff = diffFilesystemSnapshot(diskWalk.snapshots, dbSnapshots, [scanRoot]);
    expect(diff.added).toHaveLength(2);
    expect(diff.modified).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);

    // 4. Reconcile additions into real DB
    const reconcileResult = await reconciler.reconcileAdded(diff.added, [scanRoot]);
    expect(reconcileResult.successCount).toBe(2);
    expect(reconcileResult.errorCount).toBe(0);

    // 5. Verify real DB contents
    const insertedSongs = await db.select().from(songs);
    expect(insertedSongs).toHaveLength(2);
    expect(insertedSongs.map((s) => s.title)).toContain('RockSong');
    expect(insertedSongs.map((s) => s.title)).toContain('PopSong');

    const createdFolders = await db.select().from(musicFolders);
    expect(createdFolders.length).toBeGreaterThanOrEqual(3); // root + Rock + Pop
  });

  it('Pipeline Step 2: Secondary scan with no changes returns 0 additions, 0 modifications, and 0 removals', async () => {
    const rockDir = path.join(tempDir, 'Rock');
    await fs.mkdir(rockDir, { recursive: true });
    const songPath = path.join(rockDir, 'SteadyTrack.mp3');
    await fs.writeFile(songPath, 'audio data');

    const [rootFolder] = await db.insert(musicFolders).values({
      path: tempDir,
      name: path.basename(tempDir) || 'Root',
      isScanRoot: true
    }).returning();

    const scanRoot = { id: rootFolder.id, path: tempDir };

    // Initial ingest
    const walk1 = await fastDiskWalk([scanRoot]);
    const diff1 = diffFilesystemSnapshot(walk1.snapshots, [], [scanRoot]);
    await reconciler.reconcileAdded(diff1.added, [scanRoot]);

    // Secondary scan
    const walk2 = await fastDiskWalk([scanRoot]);
    const dbSongs = await db.select({
      id: songs.id,
      path: songs.path,
      fileModifiedAt: songs.fileModifiedAt,
      folderId: songs.folderId,
      isBlacklisted: songs.isBlacklisted
    }).from(songs);

    const diff2 = diffFilesystemSnapshot(walk2.snapshots, dbSongs, [scanRoot]);

    expect(diff2.added).toHaveLength(0);
    expect(diff2.modified).toHaveLength(0);
    expect(diff2.removed).toHaveLength(0);
    expect(diff2.unchangedCount).toBe(1);
  });

  it('Pipeline Step 3: Incremental scan discovers newly added nested artist/album directory structure, creates hierarchical folders, and ingests songs with 0 errors', async () => {
    // 1. Initial DB state has only the scan root
    const [rootFolder] = await db.insert(musicFolders).values({
      path: tempDir,
      name: path.basename(tempDir) || 'Root',
      isScanRoot: true
    }).returning();

    const scanRoot = { id: rootFolder.id, path: tempDir };

    // 2. Add brand-new nested directory structure on disk: Root / Adele / 21
    const adeleDir = path.join(tempDir, 'Adele');
    const album21Dir = path.join(adeleDir, '21');
    await fs.mkdir(album21Dir, { recursive: true });

    const track1Path = path.join(album21Dir, '01 - Rolling in the Deep.mp3');
    const track2Path = path.join(album21Dir, '02 - Rumour Has It.mp3');
    await fs.writeFile(track1Path, 'audio data 1');
    await fs.writeFile(track2Path, 'audio data 2');

    // 3. Fast disk walk discovers the 2 new files
    const walk = await fastDiskWalk([scanRoot]);
    expect(walk.snapshots).toHaveLength(2);
    expect(walk.failedSubtrees).toHaveLength(0);

    // 4. Diff engine detects 2 additions
    const diff = diffFilesystemSnapshot(walk.snapshots, [], [scanRoot]);
    expect(diff.added).toHaveLength(2);
    expect(diff.modified).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);

    // 5. Reconcile added tracks through the full pipeline
    const reconcileResult = await reconciler.reconcileAdded(diff.added, [scanRoot]);
    expect(reconcileResult.successCount).toBe(2);
    expect(reconcileResult.errorCount).toBe(0);
    expect(reconcileResult.errors).toHaveLength(0);

    // 6. Authoritative DB verification: hierarchy & parent-child relationships
    const allFolders = await db.select().from(musicFolders);
    const adeleDbFolder = allFolders.find((f) => path.basename(f.path) === 'Adele');
    const album21DbFolder = allFolders.find((f) => path.basename(f.path) === '21');

    expect(adeleDbFolder).toBeDefined();
    expect(album21DbFolder).toBeDefined();
    expect(adeleDbFolder?.parentId).toBe(rootFolder.id);
    expect(album21DbFolder?.parentId).toBe(adeleDbFolder?.id);

    // 7. Authoritative DB verification: songs correctly linked to album folder
    const insertedSongs = await db.select().from(songs);
    expect(insertedSongs).toHaveLength(2);
    expect(insertedSongs.every((s) => s.folderId === album21DbFolder?.id)).toBe(true);
    expect(insertedSongs.map((s) => s.title)).toContain('01 - Rolling in the Deep');
    expect(insertedSongs.map((s) => s.title)).toContain('02 - Rumour Has It');
  });
});

