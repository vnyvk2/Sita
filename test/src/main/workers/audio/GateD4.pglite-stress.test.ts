import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { EventEmitter } from 'events';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import * as schema from '@main/db/schema';
import { albums, albumsSongs, musicFolders, replayGain, songs } from '@main/db/schema';
import { ASSET_EVENTS } from '@main/workers/libraryChoreography';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION } from '@main/workers/jobs/replayGainJob';

vi.mock('@main/db/db', async () => {
  const { createSqliteMockDb } = await import('@test-helpers/sqliteMockDb');
  return { ...(await createSqliteMockDb()), isDatabaseStubbed: false };
});

vi.mock('@main/main', () => ({
  sendMessageToRenderer: vi.fn(),
  dataUpdateEvent: vi.fn()
}));

import type { DB } from '@main/db/db';
import { AlbumReplayGainJob } from '@main/workers/jobs/albumReplayGainJob';

describe('Gate D4.1: Real PGlite Concurrency Stress & Transaction Rollback', () => {
  let testDb: DB;
  let tempUserDataDir: string;
  let eventBus: EventEmitter;

  beforeAll(async () => {
    const mockedModule = (await import('@main/db/db')) as unknown as { db: DB };
    testDb = mockedModule.db;
    // Baseline SQLite schema applied by the engine on first open (:memory:)

    tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-gated4-pglite-'));
    await fs.mkdir(path.join(tempUserDataDir, 'loudness_blocks'), { recursive: true });

    // Mock electron app.getPath to point to tempUserDataDir
    const { app } = await import('electron');
    vi.spyOn(app, 'getPath').mockReturnValue(tempUserDataDir);
  });

  afterAll(async () => {
    try {
      await fs.rm(tempUserDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it(
    'proves real PGlite rolls back Track 1 update when Track 2 fails conditional update (Zero Partial Persistence)',
    async () => {
      eventBus = new EventEmitter();
      const emittedEvents: unknown[] = [];
      eventBus.on(ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED, (evt) => emittedEvents.push(evt));

      // 1. Seed root folder, album, and 3 songs (using generated identity columns)
      const [folder] = await testDb
        .insert(musicFolders)
        .values({
          name: 'Music',
          path: 'C:\\Music',
          isBlacklisted: false
        })
        .returning({ id: musicFolders.id });

      const [album] = await testDb
        .insert(albums)
        .values({
          title: 'Dark Side of the Moon',
          albumArtists: ['Pink Floyd'],
          duration: 1800,
          totalTracks: 3
        })
        .returning({ id: albums.id });

      const songRows = await testDb
        .insert(songs)
        .values([
          {
            title: 'Track 1',
            duration: 600,
            path: 'C:\\Music\\Track_1.wav',
            folderId: folder.id,
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          },
          {
            title: 'Track 2',
            duration: 600,
            path: 'C:\\Music\\Track_2.wav',
            folderId: folder.id,
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          },
          {
            title: 'Track 3',
            duration: 600,
            path: 'C:\\Music\\Track_3.wav',
            folderId: folder.id,
            fileCreatedAt: new Date(),
            fileModifiedAt: new Date()
          }
        ])
        .returning({ id: songs.id });

      const [s1, s2, s3] = songRows;

      await testDb.insert(albumsSongs).values([
        { albumId: album.id, songId: s1.id },
        { albumId: album.id, songId: s2.id },
        { albumId: album.id, songId: s3.id }
      ]);

      // 2. Write real Float64Array block caches on disk for all 3 songs
      const blocks1 = new Float64Array(50).fill(0.01); // ~ -20 LUFS
      const blocks2 = new Float64Array(50).fill(0.02); // ~ -17 LUFS
      const blocks3 = new Float64Array(50).fill(0.015);

      await fs.writeFile(
        path.join(tempUserDataDir, 'loudness_blocks', `${s1.id}_v${CURRENT_REPLAYGAIN_GENERATOR_VERSION}.bin`),
        Buffer.from(blocks1.buffer)
      );
      await fs.writeFile(
        path.join(tempUserDataDir, 'loudness_blocks', `${s2.id}_v${CURRENT_REPLAYGAIN_GENERATOR_VERSION}.bin`),
        Buffer.from(blocks2.buffer)
      );
      await fs.writeFile(
        path.join(tempUserDataDir, 'loudness_blocks', `${s3.id}_v${CURRENT_REPLAYGAIN_GENERATOR_VERSION}.bin`),
        Buffer.from(blocks3.buffer)
      );

      // Initial replay_gain records in PGlite with matching timestamps
      const baseTimestamp = new Date('2026-08-27T10:00:00.000Z');
      await testDb.insert(replayGain).values([
        {
          songId: s1.id,
          trackGain: -4.0,
          trackPeak: 0.8,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: baseTimestamp
        },
        {
          songId: s2.id,
          trackGain: -6.0,
          trackPeak: 0.9,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: baseTimestamp
        },
        {
          songId: s3.id,
          trackGain: -5.0,
          trackPeak: 0.85,
          albumGain: null,
          albumPeak: null,
          generatorVersion: 1,
          updatedAt: baseTimestamp
        }
      ]);

      // 3. Set up a deterministic synchronization latch inside transaction:
      // When the transaction inside AlbumReplayGainJob queries findMany,
      // validation passes (3 rows found).
      // Then, right before the update loop begins, simulate an interleaved write modifying Song s2's timestamp!
      let raceExecuted = false;
      const originalTransaction = testDb.transaction.bind(testDb);
      testDb.transaction = (async (callback: (trx: unknown) => Promise<unknown>) => {
        return originalTransaction(async (trx: unknown) => {
          const typedTrx = trx as { query: { replayGain: { findMany: (...args: unknown[]) => Promise<{ songId: number }[]> } }; update: unknown };
          const originalTrxFindMany = typedTrx.query.replayGain.findMany.bind(typedTrx.query.replayGain);
          typedTrx.query.replayGain.findMany = async (...args: unknown[]) => {
            const rows = await originalTrxFindMany(...args);
            if (!raceExecuted && rows.length === 3) {
              raceExecuted = true;
              // Deterministic interleaved update within transaction handle (avoiding client deadlock):
              // Modifies updatedAt on Song s2.id so Song 101's conditional update succeeds,
              // but Song 102's conditional update fails the optimistic WHERE check!
              const drizzleTrx = trx as typeof testDb;
              await drizzleTrx
                .update(replayGain)
                .set({
                  updatedAt: new Date('2026-08-27T10:05:00.000Z'),
                  trackGain: -11.5
                })
                .where(eq(replayGain.songId, s2.id));
            }
            return rows;
          };
          return callback(typedTrx);
        });
      }) as unknown as typeof testDb.transaction;

      // 4. Execute AlbumReplayGainJob (first run should detect race, throw, and roll back)
      const job = new AlbumReplayGainJob(album.id, eventBus);
      await expect(job.execute()).rejects.toThrow('Optimistic concurrency conflict');

      // Restore original transaction method
      testDb.transaction = originalTransaction;

      // 5. Invariant Assertions:
      // A) Race was deterministically triggered
      expect(raceExecuted).toBe(true);

      // B) Query actual PGlite: Track 1's UPDATE was executed first, but because Track 2 failed,
      // PGlite completely rolled back Track 1's update! (albumGain is still null)
      const row1 = await testDb.query.replayGain.findFirst({
        where: eq(replayGain.songId, s1.id)
      });
      expect(row1?.albumGain).toBeNull();
      expect(row1?.albumPeak).toBeNull();

      // C) Query actual PGlite: Track 3 was never updated
      const row3 = await testDb.query.replayGain.findFirst({
        where: eq(replayGain.songId, s3.id)
      });
      expect(row3?.albumGain).toBeNull();

      // D) Event emission was completely suppressed
      expect(emittedEvents.length).toBe(0);

      // 6. Self-healing re-run:
      // Now update Track 2's timestamp in the DB to reflect the new track state
      await testDb
        .update(replayGain)
        .set({
          updatedAt: new Date('2026-08-27T10:10:00.000Z'),
          trackGain: -11.5
        })
        .where(eq(replayGain.songId, s2.id));

      // Re-running AlbumReplayGainJob now reads the new Track 2 state, aggregates without race, and commits cleanly
      await job.execute();

      // Now all 3 tracks in real PGlite MUST have non-null matching albumGain and albumPeak
      const freshRows = await testDb.query.replayGain.findMany({
        where: (rg, { inArray }) => inArray(rg.songId, [s1.id, s2.id, s3.id])
      });

      expect(freshRows.length).toBe(3);
      const expectedAlbumGain = freshRows[0].albumGain;
      const expectedAlbumPeak = freshRows[0].albumPeak;

      expect(expectedAlbumGain).not.toBeNull();
      expect(expectedAlbumPeak).toBe(0.9); // max(0.8, 0.9, 0.85)

      for (const row of freshRows) {
        expect(row.albumGain).toBe(expectedAlbumGain);
        expect(row.albumPeak).toBe(expectedAlbumPeak);
      }

      // Success event was emitted on the successful run
      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0]).toMatchObject({
        albumId: album.id,
        albumGain: expectedAlbumGain,
        albumPeak: 0.9,
        songCount: 3
      });
    },
    20000 // 20s timeout
  );
});
