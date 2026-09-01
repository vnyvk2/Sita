import crypto from 'crypto';
import fs from 'fs/promises';

import { eq } from 'drizzle-orm';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { collectGarbageArtworks } from '../../src/main/core/garbageCollector';
import { db } from '../../src/main/db/db';
import { saveArtworks } from '../../src/main/db/queries/artworks';
import { albums, artworks, albumsArtworks, songs, artworksSongs } from '../../src/main/db/schema';
import { processArtworkFiles } from '../../src/main/other/artworks';
import { GarbageCollectionJob } from '../../src/main/workers/jobs/garbageCollectionJob';

vi.mock('fs/promises');
vi.mock('../../src/main/logger');

describe('Phase 6: Asset Lifecycle (Content Addressing & GC)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(fs.readdir).mockResolvedValue([]);
    // Clean up DB for these tests
    await db.delete(albumsArtworks);
    await db.delete(artworks);
  });

  describe('Concurrent Deduplication', () => {
    it('should generate the same hash and return a single database row under concurrent requests', async () => {
      const dummyArtworkBuffer = Buffer.from('dummy image data');
      const hash = crypto.createHash('sha256').update(dummyArtworkBuffer).digest('hex');

      // Mock Sharp processing simply to avoid actual image manipulation
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // Run processArtworkFiles twice concurrently
      const [processedA, processedB] = await Promise.all([
        processArtworkFiles('songs', dummyArtworkBuffer),
        processArtworkFiles('songs', dummyArtworkBuffer)
      ]);

      const resultA = await saveArtworks(processedA.payloads || [], db);
      const resultB = await saveArtworks(processedB.payloads || [], db);

      // Both should return the same rows
      // Note: processArtworkFiles creates exactly 2 rows for a single image:
      // 1. Full resolution image (hash: `<sha256>`)
      // 2. Optimized 50x50 thumbnail (hash: `<sha256>-optimized`)
      // This distinct hash naming prevents unique constraint violations.
      expect(resultA.length).toBe(2);
      expect(resultB.length).toBe(2);
      expect(resultA[0].hash).toBe(hash);
      expect(resultB[0].hash).toBe(hash);

      // Since it's exactly the same hash, the ON CONFLICT should ensure they return the SAME db rows
      expect(resultA[0].id).toBe(resultB[0].id);

      // Ensure that there are exactly 2 rows in the database overall
      const dbRows = await db.select().from(artworks);
      expect(dbRows.length).toBe(2);
    });
  });

  describe('Garbage Collection', () => {
    it('should preserve referenced artwork during GC', async () => {
      // 1. Insert artwork
      const dummyArtworkBuffer = Buffer.from('another dummy image');
      const processed = await processArtworkFiles('songs', dummyArtworkBuffer);
      const result = await saveArtworks(processed.payloads || [], db);
      const artworkId = result[0].id;
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // 2. Link artwork to album
      const album = await db.insert(albums).values({ title: 'test album' }).returning();
      await db.insert(albumsArtworks).values({ albumId: album[0].id, artworkId });

      // 3. Run GC
      const job = new GarbageCollectionJob();
      await job.execute();

      // 4. Verify artwork still exists
      const dbRows = await db.select().from(artworks).where(eq(artworks.id, artworkId));
      expect(dbRows.length).toBe(1);
    });

    it('should remove orphaned artwork during GC', async () => {
      // 1. Insert artwork
      const dummyArtworkBuffer = Buffer.from('orphan dummy image');
      const processed = await processArtworkFiles('songs', dummyArtworkBuffer);
      const result = await saveArtworks(processed.payloads || [], db);
      const artworkId = result[0].id;
      const optArtworkId = result[1].id;

      // Ensure it exists in db
      let dbRows = await db.select().from(artworks).where(eq(artworks.id, artworkId));
      expect(dbRows.length).toBe(1);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // 2. Run GC (it has no links in albums_artworks or others)
      const count = await collectGarbageArtworks();
      expect(count).toBeGreaterThanOrEqual(2); // The full and opt variants should be deleted

      // 3. Verify it was deleted from db
      dbRows = await db.select().from(artworks).where(eq(artworks.id, artworkId));
      expect(dbRows.length).toBe(0);

      // Verify file unlinking was attempted
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should be safe to run GC multiple times (idempotent)', async () => {
      // Run once
      await collectGarbageArtworks();

      // Run again
      const count = await collectGarbageArtworks();
      expect(count).toBe(0); // Should safely do nothing
    });
  });

  describe('Artwork Replacement & Sweep Verification', () => {
    it('should sweep old artwork when reparsing replaces it', async () => {
      // 1. Create a song and link it to Artwork A
      const bufferA = Buffer.from('artwork A');
      const processedA = await processArtworkFiles('songs', bufferA);
      const resultA = await saveArtworks(processedA.payloads || [], db);
      const artworkA_Id = resultA[0].id;

      const song = await db
        .insert(songs)
        .values({
          title: 'test song',
          path: `/test-reparse-${crypto.randomUUID()}.mp3`,
          duration: 200,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();
      await db.insert(artworksSongs).values({ songId: song[0].id, artworkId: artworkA_Id });

      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // 2. Simulate Reparse: create Artwork B and use syncSongArtworks
      const bufferB = Buffer.from('artwork B');
      const processedB = await processArtworkFiles('songs', bufferB);
      const resultB = await saveArtworks(processedB.payloads || [], db);
      const artworkB_Id = resultB[0].id;

      const { syncSongArtworks } = await import('../../src/main/db/queries/artworks');
      await syncSongArtworks(song[0].id, [artworkB_Id], db);

      // 3. Run GC
      await collectGarbageArtworks();

      // 4. Verify Artwork A is deleted from DB but Artwork B remains
      const dbRowsA = await db.select().from(artworks).where(eq(artworks.id, artworkA_Id));
      expect(dbRowsA.length).toBe(0);

      const dbRowsB = await db.select().from(artworks).where(eq(artworks.id, artworkB_Id));
      expect(dbRowsB.length).toBe(1);
    });

    it('should sweep old artwork when metadata updates replace it', async () => {
      // 1. Create a song and link it to Artwork X
      const bufferX = Buffer.from('artwork X');
      const processedX = await processArtworkFiles('songs', bufferX);
      const resultX = await saveArtworks(processedX.payloads || [], db);
      const artworkX_Id = resultX[0].id;

      const song = await db
        .insert(songs)
        .values({
          title: 'test song 2',
          path: `/test-metadata-${crypto.randomUUID()}.mp3`,
          duration: 200,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();
      await db.insert(artworksSongs).values({ songId: song[0].id, artworkId: artworkX_Id });

      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // 2. Simulate Metadata Update: create Artwork Y and use syncSongArtworks
      const bufferY = Buffer.from('artwork Y');
      const processedY = await processArtworkFiles('songs', bufferY);
      const resultY = await saveArtworks(processedY.payloads || [], db);
      const artworkY_Id = resultY[0].id;

      const { syncSongArtworks } = await import('../../src/main/db/queries/artworks');
      await syncSongArtworks(song[0].id, [artworkY_Id], db);

      // 3. Run GC
      await collectGarbageArtworks();

      // 4. Verify Artwork X is deleted from DB but Artwork Y remains
      const dbRowsX = await db.select().from(artworks).where(eq(artworks.id, artworkX_Id));
      expect(dbRowsX.length).toBe(0);

      const dbRowsY = await db.select().from(artworks).where(eq(artworks.id, artworkY_Id));
      expect(dbRowsY.length).toBe(1);
    });
  });

  describe('Waveform GC & Stale Candidate Promotion', () => {
    it('promotes the newest stale temp file deterministically when multiple stale temp files exist', async () => {
      const { waveforms } = await import('../../src/main/db/schema');
      const songPath = `/test-waveform-${crypto.randomUUID()}.wav`;
      const song = await db
        .insert(songs)
        .values({
          title: 'Waveform song',
          path: songPath,
          duration: 120,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        })
        .returning();

      const waveformPath = 'C:/mock/userData/waveforms/999_v1.bin';
      const insertedWaveform = await db
        .insert(waveforms)
        .values({
          songId: song[0].id,
          path: waveformPath,
          resolution: 200,
          generatorVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      const now = Date.now();
      vi.mocked(fs.readdir).mockResolvedValue([
        '999_v1.bin.1111.task-old.tmp',
        '999_v1.bin.2222.task-new.tmp'
      ] as any);

      vi.mocked(fs.stat).mockImplementation(async (filePath) => {
        if (filePath === waveformPath) {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        if (typeof filePath === 'string' && filePath.includes('task-old')) {
          return { mtimeMs: now - 200_000, size: 800 } as any;
        }
        if (typeof filePath === 'string' && filePath.includes('task-new')) {
          return { mtimeMs: now - 100_000, size: 800 } as any;
        }
        return { mtimeMs: now - 100_000, size: 800 } as any;
      });

      vi.mocked(fs.link).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const job = new GarbageCollectionJob();
      await job.execute();

      // Proves: newest candidate (task-new) was promoted via link to destination
      expect(fs.link).toHaveBeenCalledWith(
        expect.stringContaining('999_v1.bin.2222.task-new.tmp'),
        waveformPath
      );
    });
  });
});
