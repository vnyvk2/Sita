import fs from 'fs';
import os from 'os';
import path from 'path';

import { getSongArtworkPath } from '@main/fs/resolveFilePaths';
import { ArtworkCacheInvalidator } from '@main/metadata/transactions/ArtworkCacheInvalidator';
import { describe, expect, it } from 'vitest';

describe('ArtworkCacheInvalidator (Phase 5-D Lifecycle)', () => {
  it('does NOT delete or unlink physical artwork files on disk during invalidation', () => {
    const tempDir = path.join(os.tmpdir(), `artwork_inval_test_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'art1.webp'), 'test');
    fs.writeFileSync(path.join(tempDir, 'art2.webp'), 'test');

    const invalidator = new ArtworkCacheInvalidator();
    invalidator.invalidateArtworkCache(tempDir, tempDir);

    expect(fs.existsSync(tempDir)).toBe(true);
    // Invariant: Physical artwork files MUST remain intact
    expect(fs.readdirSync(tempDir).length).toBe(2);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('updates in-memory artwork cache timestamps on invalidation', async () => {
    const initialPaths = getSongArtworkPath(123, true);
    const initialTs = Number(initialPaths.artworkPath?.split('?ts=')[1]);

    await new Promise((r) => setTimeout(r, 5));

    const invalidator = new ArtworkCacheInvalidator();
    invalidator.invalidateArtworkCache();

    const updatedPaths = getSongArtworkPath(123, true);
    const updatedTs = Number(updatedPaths.artworkPath?.split('?ts=')[1]);

    expect(updatedTs).toBeGreaterThan(initialTs);
  });
});
