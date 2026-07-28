import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../../src/main/db/db';
import { albums, artworks, albumsArtworks } from '../../src/main/db/schema';
import { storeArtworks } from '../../src/main/other/artworks';
import { collectGarbageArtworks } from '../../src/main/core/garbageCollector';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { GarbageCollectionJob } from '../../src/main/workers/jobs/garbageCollectionJob';

vi.mock('fs/promises');
vi.mock('../../src/main/logger');

describe('Phase 6: Asset Lifecycle (Content Addressing & GC)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

      // Run storeArtworks twice concurrently
      const [resultA, resultB] = await Promise.all([
        storeArtworks('songs', dummyArtworkBuffer, db),
        storeArtworks('songs', dummyArtworkBuffer, db)
      ]);

      // Both should return the same rows
      // Note: storeArtworks returns exactly 2 rows for a single image:
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
      const result = await storeArtworks('songs', dummyArtworkBuffer, db);
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
      const result = await storeArtworks('songs', dummyArtworkBuffer, db);
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
});
