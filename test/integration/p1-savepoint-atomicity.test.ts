import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { albums, albumsArtists, albumsSongs, artists, artistsSongs, artworksSongs, genres, genresSongs, musicFolders, songs } from '@main/db/schema';

// Mock DB with real in-memory SQLite (baseline schema applied by the engine)
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

import { db } from '@main/db/db';
import { ingestTrackDTO } from '@main/parseSong/ingestTrackDTO';
import type { ParsedTrackDTO } from '@main/workers/process/workerProtocol';

describe('P1 FORENSIC INTEGRATION: Real PGlite Savepoint / Per-Track Ingestion Atomicity', () => {
  let rootFolderId: number;

  beforeAll(async () => {
    // Baseline SQLite schema is applied by the engine on first open (:memory:)
  });

  beforeEach(async () => {
    // Clear all tables in foreign-key safe order
    await db.delete(artworksSongs);
    await db.delete(artistsSongs);
    await db.delete(genresSongs);
    await db.delete(albumsSongs);
    await db.delete(albumsArtists);
    await db.delete(songs);
    await db.delete(albums);
    await db.delete(artists);
    await db.delete(genres);
    await db.delete(musicFolders);

    const [folder] = await db.insert(musicFolders).values({
      name: 'TestMusic',
      path: '/mock/music'
    }).returning();
    rootFolderId = folder.id;
  });

  function makeTrackDTO(suffix: string, custom?: Partial<ParsedTrackDTO>): ParsedTrackDTO {
    return {
      songPath: `/mock/music/track_${suffix}.mp3`,
      title: `Title ${suffix}`,
      duration: 180,
      artists: [`Artist ${suffix}`],
      albumArtists: [`AlbumArtist ${suffix}`],
      album: `Album ${suffix}`,
      genres: [`Genre ${suffix}`],
      year: 2024,
      sampleRate: 44100,
      bitRate: 320000,
      noOfChannels: 2,
      diskNumber: 1,
      trackNumber: 1,
      fileCreatedAt: new Date(),
      fileModifiedAt: new Date(),
      folderId: rootFolderId,
      ...custom
    };
  }

  it('Batch Atomicity: Middle track (Track B) throws JS exception mid-ingestion -> Track B rolls back completely, Tracks A and C commit', async () => {
    const trackA = makeTrackDTO('A');
    const trackB = makeTrackDTO('B');
    const trackC = makeTrackDTO('C');

    const batch = [trackA, trackB, trackC];
    const errors: { path: string; error: string }[] = [];
    const successfulSongIds: number[] = [];

    // Simulate batch ingestion loop inside outer db.transaction
    await db.transaction(async (trx) => {
      for (let i = 0; i < batch.length; i++) {
        const track = batch[i];
        try {
          // SAVEPOINT wrapper
          const res = await trx.transaction(async (savepointTrx) => {
            if (track.songPath.includes('track_B')) {
              // Perform partial write (song row inserted)
              const [partialSong] = await savepointTrx.insert(songs).values({
                title: track.title,
                duration: track.duration,
                path: track.songPath,
                folderId: track.folderId,
                fileCreatedAt: new Date(),
                fileModifiedAt: new Date()
              }).returning();

              expect(partialSong.id).toBeDefined();

              // Simulate a fatal JS exception during downstream relationship management
              throw new Error('Simulated JS crash during manageGenresOfParsedSong');
            }

            return await ingestTrackDTO(track, savepointTrx);
          });

          if (res) {
            successfulSongIds.push(res.songData.id);
          }
        } catch (err: any) {
          errors.push({ path: track.songPath, error: err.message });
        }
      }
    });

    // Verification:
    // 1. Errors captured for Track B only
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe(trackB.songPath);
    expect(errors[0].error).toContain('Simulated JS crash');

    // 2. Successful IDs recorded for Track A and C
    expect(successfulSongIds).toHaveLength(2);

    // 3. Database contents check: Only Track A and Track C exist
    const allSongs = await db.select().from(songs);
    expect(allSongs).toHaveLength(2);
    expect(allSongs.map((s) => s.path)).toContain(trackA.songPath);
    expect(allSongs.map((s) => s.path)).toContain(trackC.songPath);
    expect(allSongs.map((s) => s.path)).not.toContain(trackB.songPath);

    // 4. Verify no dangling albums, artists, or genres for Track B
    const allAlbums = await db.select().from(albums);
    expect(allAlbums.map((a) => a.title)).toContain('Album A');
    expect(allAlbums.map((a) => a.title)).toContain('Album C');
    expect(allAlbums.map((a) => a.title)).not.toContain('Album B');

    const allArtists = await db.select().from(artists);
    expect(allArtists.map((a) => a.name)).toContain('Artist A');
    expect(allArtists.map((a) => a.name)).toContain('Artist C');
    expect(allArtists.map((a) => a.name)).not.toContain('Artist B');
  });

  it('Batch Atomicity: First track (Track A) fails -> Tracks B and C commit cleanly', async () => {
    const trackA = makeTrackDTO('A');
    const trackB = makeTrackDTO('B');
    const trackC = makeTrackDTO('C');

    const batch = [trackA, trackB, trackC];
    const errors: { path: string; error: string }[] = [];

    await db.transaction(async (trx) => {
      for (const track of batch) {
        try {
          await trx.transaction(async (savepointTrx) => {
            if (track.songPath.includes('track_A')) {
              await savepointTrx.insert(songs).values({
                title: track.title,
                duration: track.duration,
                path: track.songPath,
                folderId: track.folderId,
                fileCreatedAt: new Date(),
                fileModifiedAt: new Date()
              });
              throw new Error('Track A failure');
            }
            return await ingestTrackDTO(track, savepointTrx);
          });
        } catch (err: any) {
          errors.push({ path: track.songPath, error: err.message });
        }
      }
    });

    expect(errors).toHaveLength(1);
    const dbSongs = await db.select().from(songs);
    expect(dbSongs).toHaveLength(2);
    expect(dbSongs.map((s) => s.path)).toEqual([trackB.songPath, trackC.songPath]);
  });

  it('Batch Atomicity: Last track (Track C) fails -> Tracks A and B commit cleanly', async () => {
    const trackA = makeTrackDTO('A');
    const trackB = makeTrackDTO('B');
    const trackC = makeTrackDTO('C');

    const batch = [trackA, trackB, trackC];
    const errors: { path: string; error: string }[] = [];

    await db.transaction(async (trx) => {
      for (const track of batch) {
        try {
          await trx.transaction(async (savepointTrx) => {
            if (track.songPath.includes('track_C')) {
              await savepointTrx.insert(songs).values({
                title: track.title,
                duration: track.duration,
                path: track.songPath,
                folderId: track.folderId,
                fileCreatedAt: new Date(),
                fileModifiedAt: new Date()
              });
              throw new Error('Track C failure');
            }
            return await ingestTrackDTO(track, savepointTrx);
          });
        } catch (err: any) {
          errors.push({ path: track.songPath, error: err.message });
        }
      }
    });

    expect(errors).toHaveLength(1);
    const dbSongs = await db.select().from(songs);
    expect(dbSongs).toHaveLength(2);
    expect(dbSongs.map((s) => s.path)).toEqual([trackA.songPath, trackB.songPath]);
  });

  it('Batch Atomicity: Multiple failing tracks (Track A and Track C fail) -> Only Track B commits', async () => {
    const trackA = makeTrackDTO('A');
    const trackB = makeTrackDTO('B');
    const trackC = makeTrackDTO('C');

    const batch = [trackA, trackB, trackC];
    const errors: { path: string; error: string }[] = [];

    await db.transaction(async (trx) => {
      for (const track of batch) {
        try {
          await trx.transaction(async (savepointTrx) => {
            if (track.songPath.includes('track_A') || track.songPath.includes('track_C')) {
              await savepointTrx.insert(songs).values({
                title: track.title,
                duration: track.duration,
                path: track.songPath,
                folderId: track.folderId,
                fileCreatedAt: new Date(),
                fileModifiedAt: new Date()
              });
              throw new Error(`Failure on ${track.songPath}`);
            }
            return await ingestTrackDTO(track, savepointTrx);
          });
        } catch (err: any) {
          errors.push({ path: track.songPath, error: err.message });
        }
      }
    });

    expect(errors).toHaveLength(2);
    const dbSongs = await db.select().from(songs);
    expect(dbSongs).toHaveLength(1);
    expect(dbSongs[0].path).toBe(trackB.songPath);
  });
});
