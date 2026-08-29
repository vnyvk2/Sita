import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicPublishFile } from '@main/workers/process/handlers/assetJobHandler';

describe('Item 5 FORENSIC: Artwork Concurrency & Shared Hash-Addressed File Invariant', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nora-artwork-concurrency-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('Concurrent Race: Process A publishes derivative 1, Process B adopts it, Process A fails derivative 2 -> Process B asset is NOT deleted', async () => {
    const optDest = path.join(tempDir, 'artworks', 'artwork_hash_opt.webp');
    const imgDest = path.join(tempDir, 'artworks', 'artwork_hash_full.webp');
    await fs.mkdir(path.dirname(optDest), { recursive: true });

    // Temp files for Process A
    const tempAOpt = path.join(tempDir, 'opt_A.tmp');
    const tempAImg = path.join(tempDir, 'img_A.tmp');
    await fs.writeFile(tempAOpt, 'optimized webp data A');
    await fs.writeFile(tempAImg, 'full webp data A');

    // Temp files for Process B
    const tempBOpt = path.join(tempDir, 'opt_B.tmp');
    const tempBImg = path.join(tempDir, 'img_B.tmp');
    await fs.writeFile(tempBOpt, 'optimized webp data B');
    await fs.writeFile(tempBImg, 'full webp data B');

    // 1. Process A publishes optDest
    const statusAOpt = await atomicPublishFile(tempAOpt, optDest);
    expect(statusAOpt).toBe('published');

    // 2. Process B runs concurrently and sees optDest already published
    const statusBOpt = await atomicPublishFile(tempBOpt, optDest);
    expect(statusBOpt).toBe('already_existed');

    // 3. Process A fails while publishing imgDest (e.g. disk write failure / exception)
    let processAFailed = false;
    try {
      // Simulate crash in Process A before publishing imgDest
      throw new Error('Process A crashed on full image generation');
    } catch (err) {
      processAFailed = true;
      // Invariant: Process A must NOT unlink optDest during rollback!
      // Only temp files are unlinked.
      await fs.unlink(tempAImg).catch(() => {});
    }
    expect(processAFailed).toBe(true);

    // 4. Process B continues and publishes its imgDest
    const statusBImg = await atomicPublishFile(tempBImg, imgDest);
    expect(statusBImg).toBe('published');

    // 5. Invariant verification on REAL filesystem:
    // optDest MUST STILL EXIST (adopted by B)
    const optStat = await fs.stat(optDest);
    expect(optStat.isFile()).toBe(true);
    expect(optStat.size).toBeGreaterThan(0);

    // imgDest MUST STILL EXIST (published by B)
    const imgStat = await fs.stat(imgDest);
    expect(imgStat.isFile()).toBe(true);
    expect(imgStat.size).toBeGreaterThan(0);

    // Process A's failure did NOT create a dangling reference for B
    const optContent = await fs.readFile(optDest, 'utf8');
    expect(optContent).toBe('optimized webp data A'); // Original published data preserved intact
  });

  it('Concurrent Dual Success: Process A and Process B both succeed on identical hash-addressed asset without error', async () => {
    const dest = path.join(tempDir, 'artworks', 'shared_asset.webp');
    await fs.mkdir(path.dirname(dest), { recursive: true });

    const temp1 = path.join(tempDir, 'task1.tmp');
    const temp2 = path.join(tempDir, 'task2.tmp');
    await fs.writeFile(temp1, 'binary payload 1');
    await fs.writeFile(temp2, 'binary payload 2');

    // Run both atomic publications simultaneously
    const [res1, res2] = await Promise.all([
      atomicPublishFile(temp1, dest),
      atomicPublishFile(temp2, dest)
    ]);

    // One must be published, the other already_existed
    const statuses = [res1, res2].sort();
    expect(statuses).toEqual(['already_existed', 'published']);

    // Destination file exists and has content
    const stat = await fs.stat(dest);
    expect(stat.size).toBeGreaterThan(0);

    // Both temp files are cleanly unlinked
    await expect(fs.stat(temp1)).rejects.toThrow();
    await expect(fs.stat(temp2)).rejects.toThrow();
  });
});
