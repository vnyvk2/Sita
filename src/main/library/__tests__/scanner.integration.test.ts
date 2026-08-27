import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@main/other/artworks', () => ({
  sweepUnusedArtworks: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));


import type { PGlite } from '@electric-sql/pglite';
import { db } from '@main/db/db';
const client = (db as unknown as { $client: PGlite }).$client;
import { diffFilesystemSnapshot, type DbSongSnapshot } from '../diffEngine';
import { fastDiskWalk } from '../fastDiskWalk';
import { LibraryReconciler } from '../LibraryReconciler';

describe('Scanner Pipeline End-to-End Integration (B-5b)', () => {
  let tempDir: string;
  let reconciler: LibraryReconciler;

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
      name: path.basename(tempDir) || 'Root'
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
      name: path.basename(tempDir) || 'Root'
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
      name: path.basename(tempDir) || 'Root'
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

  it('Pipeline Step 4: Multi-source scan with mixed scenarios (track in existing album, new album in existing artist, new artist+album across multiple roots)', async () => {
    // 1. Setup Root 1 and Root 2 directories on disk
    const root1Dir = path.join(tempDir, 'Root1');
    const root2Dir = path.join(tempDir, 'Root2');
    await fs.mkdir(root1Dir, { recursive: true });
    await fs.mkdir(root2Dir, { recursive: true });

    // 2. Insert scan roots into DB
    const [root1Folder] = await db.insert(musicFolders).values({
      path: root1Dir,
      name: 'Root1'
    }).returning();

    const [root2Folder] = await db.insert(musicFolders).values({
      path: root2Dir,
      name: 'Root2'
    }).returning();

    // 3. Setup existing Artist (Adele) and Album (21) in DB under Root 1
    const adelePath = path.join(root1Dir, 'Adele');
    const album21Path = path.join(adelePath, '21');
    await fs.mkdir(album21Path, { recursive: true });

    const [existingAdele] = await db.insert(musicFolders).values({
      path: adelePath,
      name: 'Adele',
      parentId: root1Folder.id
    }).returning();

    const [existing21] = await db.insert(musicFolders).values({
      path: album21Path,
      name: '21',
      parentId: existingAdele.id
    }).returning();

    // Existing song in DB
    const existingSongPath = path.join(album21Path, 'ExistingSong.mp3');
    await fs.writeFile(existingSongPath, 'existing audio');
    const [existingSong] = await db.insert(songs).values({
      title: 'ExistingSong',
      duration: '180',
      path: existingSongPath,
      folderId: existing21.id,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date()
    }).returning();

    // 4. Create additions on disk:
    // Root 1 Case A: Track added to existing album (Adele/21)
    const newTrackInExistingAlbum = path.join(album21Path, 'NewTrackIn21.mp3');
    await fs.writeFile(newTrackInExistingAlbum, 'audio data A');

    // Root 1 Case B: New album under existing artist (Adele/25)
    const album25Path = path.join(adelePath, '25');
    await fs.mkdir(album25Path, { recursive: true });
    const trackInNewAlbum = path.join(album25Path, 'Hello.mp3');
    await fs.writeFile(trackInNewAlbum, 'audio data B');

    // Root 1 Case C: Brand new artist and album (Coldplay/Parachutes)
    const coldplayAlbumPath = path.join(root1Dir, 'Coldplay', 'Parachutes');
    await fs.mkdir(coldplayAlbumPath, { recursive: true });
    const trackInColdplay = path.join(coldplayAlbumPath, 'Yellow.mp3');
    await fs.writeFile(trackInColdplay, 'audio data C');

    // Root 2 Case D: Brand new artist and album on a different scan root (PinkFloyd/TheWall)
    const pinkFloydAlbumPath = path.join(root2Dir, 'PinkFloyd', 'TheWall');
    await fs.mkdir(pinkFloydAlbumPath, { recursive: true });
    const trackInPinkFloyd = path.join(pinkFloydAlbumPath, 'ComfortablyNumb.mp3');
    await fs.writeFile(trackInPinkFloyd, 'audio data D');

    const scanRoots = [
      { id: root1Folder.id, path: root1Dir },
      { id: root2Folder.id, path: root2Dir }
    ];

    // 5. Execute fastDiskWalk on both roots
    const walk = await fastDiskWalk(scanRoots);
    expect(walk.snapshots).toHaveLength(5); // 1 existing + 4 new

    // 6. Diff against DB (which only has existingSong)
    const dbSongSnapshots = [
      {
        id: existingSong.id,
        path: existingSong.path,
        fileModifiedAt: existingSong.fileModifiedAt,
        folderId: existingSong.folderId,
        isBlacklisted: false
      }
    ];

    const diff = diffFilesystemSnapshot(walk.snapshots, dbSongSnapshots, scanRoots);
    expect(diff.added).toHaveLength(4);
    expect(diff.unchangedCount).toBe(1);

    // 7. Reconcile all 4 additions across both scan roots
    const reconcileResult = await reconciler.reconcileAdded(diff.added, scanRoots);
    expect(reconcileResult.successCount).toBe(4);
    expect(reconcileResult.errorCount).toBe(0);
    expect(reconcileResult.errors).toHaveLength(0);

    // 8. Authoritative DB verification for folders
    const allFolders = await db.select().from(musicFolders);
    const adeleFolders = allFolders.filter((f) => path.basename(f.path) === 'Adele');
    expect(adeleFolders).toHaveLength(1); // Adele was reused, not duplicated!

    const album21Folders = allFolders.filter((f) => path.basename(f.path) === '21');
    expect(album21Folders).toHaveLength(1); // 21 was reused, not duplicated!

    const album25Folder = allFolders.find((f) => path.basename(f.path) === '25');
    expect(album25Folder).toBeDefined();
    expect(album25Folder?.parentId).toBe(existingAdele.id); // Adele/25 parent is Adele

    const coldplayArtist = allFolders.find((f) => path.basename(f.path) === 'Coldplay');
    const parachutesAlbum = allFolders.find((f) => path.basename(f.path) === 'Parachutes');
    expect(coldplayArtist).toBeDefined();
    expect(parachutesAlbum).toBeDefined();
    expect(coldplayArtist?.parentId).toBe(root1Folder.id); // Under Root 1
    expect(parachutesAlbum?.parentId).toBe(coldplayArtist?.id);

    const pinkFloydArtist = allFolders.find((f) => path.basename(f.path) === 'PinkFloyd');
    const theWallAlbum = allFolders.find((f) => path.basename(f.path) === 'TheWall');
    expect(pinkFloydArtist).toBeDefined();
    expect(theWallAlbum).toBeDefined();
    expect(pinkFloydArtist?.parentId).toBe(root2Folder.id); // Under Root 2
    expect(theWallAlbum?.parentId).toBe(pinkFloydArtist?.id);

    // 9. Authoritative DB verification for all songs
    const allDbSongs = await db.select().from(songs);
    expect(allDbSongs).toHaveLength(5);

    const newSongIn21 = allDbSongs.find((s) => s.title === 'NewTrackIn21');
    expect(newSongIn21?.folderId).toBe(existing21.id);

    const newSongIn25 = allDbSongs.find((s) => s.title === 'Hello');
    expect(newSongIn25?.folderId).toBe(album25Folder?.id);

    const yellowSong = allDbSongs.find((s) => s.title === 'Yellow');
    expect(yellowSong?.folderId).toBe(parachutesAlbum?.id);

    const numbSong = allDbSongs.find((s) => s.title === 'ComfortablyNumb');
    expect(numbSong?.folderId).toBe(theWallAlbum?.id);
  });

  it('Pipeline Step 5: Deleting tracks from disk removes them from the DB, leaves remaining tracks intact, and updates subsequent scan identity', async () => {
    // 1. Setup scan root in DB
    const [rootFolder] = await db.insert(musicFolders).values({
      path: tempDir,
      name: 'Root'
    }).returning();

    const scanRoot = { id: rootFolder.id, path: tempDir };

    // 2. Setup 3 tracks on disk: Adele/21/SongA, Adele/21/SongB, Adele/25/SongC
    const album21Dir = path.join(tempDir, 'Adele', '21');
    const album25Dir = path.join(tempDir, 'Adele', '25');
    await fs.mkdir(album21Dir, { recursive: true });
    await fs.mkdir(album25Dir, { recursive: true });

    const songAPath = path.join(album21Dir, 'SongA.mp3');
    const songBPath = path.join(album21Dir, 'SongB.mp3');
    const songCPath = path.join(album25Dir, 'SongC.mp3');
    await fs.writeFile(songAPath, 'audio A');
    await fs.writeFile(songBPath, 'audio B');
    await fs.writeFile(songCPath, 'audio C');

    // 3. Ingest all 3 tracks initially
    const initialWalk = await fastDiskWalk([scanRoot]);
    const initialDiff = diffFilesystemSnapshot(initialWalk.snapshots, [], [scanRoot]);
    const addResult = await reconciler.reconcileAdded(initialDiff.added, [scanRoot]);
    expect(addResult.successCount).toBe(3);
    expect(addResult.errorCount).toBe(0);

    const initialSongs = await db.select().from(songs);
    expect(initialSongs).toHaveLength(3);

    // 4. Delete SongB and SongC from disk (leaving only SongA)
    await fs.rm(songBPath, { force: true });
    await fs.rm(songCPath, { force: true });

    // 5. Subsequent scan: fastDiskWalk discovers only SongA
    const secondWalk = await fastDiskWalk([scanRoot]);
    expect(secondWalk.snapshots).toHaveLength(1);
    expect(secondWalk.snapshots[0].path).toBe(songAPath);

    // 6. Diff engine calculates: added=0, unchanged=1 (SongA), removed=2 (SongB, SongC)
    const dbSnapshots = initialSongs.map((s) => ({
      id: s.id,
      path: s.path,
      fileModifiedAt: s.fileModifiedAt,
      folderId: s.folderId,
      isBlacklisted: false
    }));

    const removalDiff = diffFilesystemSnapshot(secondWalk.snapshots, dbSnapshots, [scanRoot]);
    expect(removalDiff.added).toHaveLength(0);
    expect(removalDiff.unchangedCount).toBe(1);
    expect(removalDiff.removed).toHaveLength(2);
    expect(removalDiff.removed.map((r) => r.path)).toContain(songBPath);
    expect(removalDiff.removed.map((r) => r.path)).toContain(songCPath);

    // 7. Reconcile removals through LibraryReconciler
    const removalResult = await reconciler.reconcileRemoved(removalDiff.removed);
    expect(removalResult.successCount).toBe(2);
    expect(removalResult.errorCount).toBe(0);

    // 8. Authoritative DB verification: Only SongA remains in database
    const remainingSongs = await db.select().from(songs);
    expect(remainingSongs).toHaveLength(1);
    expect(remainingSongs[0].path).toBe(songAPath);
    expect(remainingSongs[0].title).toBe('SongA');

    // 9. Third scan with no further changes: pure identity (unchanged=1, 0 added/modified/removed)
    const thirdWalk = await fastDiskWalk([scanRoot]);
    const thirdDbSnapshots = remainingSongs.map((s) => ({
      id: s.id,
      path: s.path,
      fileModifiedAt: s.fileModifiedAt,
      folderId: s.folderId,
      isBlacklisted: false
    }));

    const thirdDiff = diffFilesystemSnapshot(thirdWalk.snapshots, thirdDbSnapshots, [scanRoot]);
    expect(thirdDiff.added).toHaveLength(0);
    expect(thirdDiff.modified).toHaveLength(0);
    expect(thirdDiff.removed).toHaveLength(0);
    expect(thirdDiff.unchangedCount).toBe(1);
  });
});



