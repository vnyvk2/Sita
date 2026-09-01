import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import * as schema from '@main/db/schema';
import { musicFolders, songs } from '@main/db/schema';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB with in-memory PGlite
vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return createSqliteMockDb();
});

vi.mock('@main/other/artworks', () => ({
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

import { db } from '@main/db/db';
import { diffFilesystemSnapshot, type DbSongSnapshot } from '@main/library/diffEngine';
import { LibraryReconciler } from '@main/library/LibraryReconciler';

describe('P0 FORENSIC INTEGRATION: Mass-Deletion Invariant Under Real Pipeline', () => {
  let tempDir: string;
  let reconciler: LibraryReconciler;

  beforeAll(async () => {
    reconciler = new LibraryReconciler();
  });

  beforeEach(async () => {
    await db.delete(songs);
    await db.delete(musicFolders);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-p0-forensic-'));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('Scenario A: Global walk failure with existing DB songs must result in ZERO removals and ZERO DB deletions', async () => {
    // 1. Setup scan root on disk
    const [rootFolder] = await db
      .insert(musicFolders)
      .values({
        path: tempDir,
        name: 'RootFolder'
      })
      .returning();
    const scanRoot = { id: rootFolder.id, path: tempDir };

    // 2. Pre-populate DB with 3 existing songs
    const song1Path = path.join(tempDir, 'Track1.mp3');
    const song2Path = path.join(tempDir, 'Track2.flac');
    const song3Path = path.join(tempDir, 'Track3.wav');

    await db.insert(songs).values([
      {
        title: 'Track 1',
        duration: 180,
        path: song1Path,
        folderId: rootFolder.id,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      },
      {
        title: 'Track 2',
        duration: 200,
        path: song2Path,
        folderId: rootFolder.id,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      },
      {
        title: 'Track 3',
        duration: 220,
        path: song3Path,
        folderId: rootFolder.id,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      }
    ]);

    const initialDbSongs = await db.select().from(songs);
    expect(initialDbSongs).toHaveLength(3);

    // 3. Simulate a global walk failure (e.g. permission error, worker crash, or disk read error)
    // The bridge / scanner marks walkFailed = true, and empty snapshots are returned
    const diskSnapshots: any[] = [];
    const dbSnapshots: DbSongSnapshot[] = initialDbSongs.map((s) => ({
      id: s.id,
      path: s.path,
      fileModifiedAt: s.fileModifiedAt,
      folderId: s.folderId,
      isBlacklisted: false
    }));

    // 4. Run through diffEngine with walkFailed: true
    const diff = diffFilesystemSnapshot(diskSnapshots, dbSnapshots, [scanRoot], {
      walkFailed: true
    });

    // Invariant verification: ZERO removed, even though diskSnapshots is completely empty
    expect(diff.removed).toHaveLength(0);

    // 5. Run reconciler with diff.removed (which is empty)
    const removalResult = await reconciler.reconcileRemoved(diff.removed);
    expect(removalResult.successCount).toBe(0);
    expect(removalResult.errorCount).toBe(0);

    // 6. Authoritative DB verification: ALL 3 songs STILL exist in database
    const finalDbSongs = await db.select().from(songs);
    expect(finalDbSongs).toHaveLength(3);
    expect(finalDbSongs.map((s) => s.title)).toEqual(['Track 1', 'Track 2', 'Track 3']);
  });

  it('Scenario B: Partial subtree failure protects songs in failed subtree while reconciling other additions', async () => {
    // 1. Setup scan root
    const [rootFolder] = await db
      .insert(musicFolders)
      .values({
        path: tempDir,
        name: 'RootFolder'
      })
      .returning();
    const scanRoot = { id: rootFolder.id, path: tempDir };

    const rockDir = path.join(tempDir, 'Rock');
    const popDir = path.join(tempDir, 'Pop');
    await fs.mkdir(rockDir, { recursive: true });
    await fs.mkdir(popDir, { recursive: true });

    // Existing song in DB under /Rock (which will fail during walk)
    const existingRockSong = path.join(rockDir, 'ClassicRock.mp3');
    await db.insert(songs).values({
      title: 'ClassicRock',
      duration: 300,
      path: existingRockSong,
      folderId: rootFolder.id,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    });

    // New file on disk under /Pop
    const newPopSong = path.join(popDir, 'NewHit.mp3');
    await fs.writeFile(newPopSong, 'pop audio data');

    // Simulate walk: /Pop/NewHit is discovered, but /Rock encountered permission error and is in failedSubtrees
    const diskSnapshots = [
      {
        path: newPopSong,
        fileModifiedAt: new Date(),
        size: 1024,
        rootId: rootFolder.id,
        dirPath: popDir
      }
    ];
    const failedSubtrees = [rockDir];

    const currentDbSongs = await db.select().from(songs);
    const dbSnapshots: DbSongSnapshot[] = currentDbSongs.map((s) => ({
      id: s.id,
      path: s.path,
      fileModifiedAt: s.fileModifiedAt,
      folderId: s.folderId,
      isBlacklisted: false
    }));

    // Diff with failedSubtrees
    const diff = diffFilesystemSnapshot(diskSnapshots, dbSnapshots, [scanRoot], {
      failedSubtrees,
      walkFailed: false
    });

    // Invariant:
    // 1. New pop song IS detected as added
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].path).toBe(newPopSong);
    // 2. Existing rock song under failed subtree is NOT removed
    expect(diff.removed).toHaveLength(0);

    // Reconcile removals (0 removals)
    await reconciler.reconcileRemoved(diff.removed);

    // DB verification: BOTH the existing Rock song is STILL in DB
    const finalSongs = await db.select().from(songs);
    expect(finalSongs.map((s) => s.path)).toContain(existingRockSong);
  });

  it('Scenario C: Legitimate empty directory scan STILL performs removals (walkFailed: false, no failed subtrees)', async () => {
    const [rootFolder] = await db
      .insert(musicFolders)
      .values({
        path: tempDir,
        name: 'RootFolder'
      })
      .returning();
    const scanRoot = { id: rootFolder.id, path: tempDir };

    // DB has a song that was deleted from disk
    const oldSongPath = path.join(tempDir, 'DeletedSong.mp3');
    await db.insert(songs).values({
      title: 'DeletedSong',
      duration: 180,
      path: oldSongPath,
      folderId: rootFolder.id,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    });

    const currentDbSongs = await db.select().from(songs);
    expect(currentDbSongs).toHaveLength(1);

    const dbSnapshots: DbSongSnapshot[] = currentDbSongs.map((s) => ({
      id: s.id,
      path: s.path,
      fileModifiedAt: s.fileModifiedAt,
      folderId: s.folderId,
      isBlacklisted: false
    }));

    // Successful empty walk (user emptied the folder): snapshots = [], walkFailed = false, failedSubtrees = []
    const diff = diffFilesystemSnapshot([], dbSnapshots, [scanRoot], {
      walkFailed: false,
      failedSubtrees: [],
      failedPaths: []
    });

    // Invariant: Because walk succeeded legitimately, diff.removed CONTAINS the deleted song
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].path).toBe(oldSongPath);

    // Reconcile removal
    const removalResult = await reconciler.reconcileRemoved(diff.removed);
    expect(removalResult.successCount).toBe(1);

    // DB verification: Song is cleanly removed
    const finalSongs = await db.select().from(songs);
    expect(finalSongs).toHaveLength(0);
  });
});
