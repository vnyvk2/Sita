import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanThumbnailCache,
  computeThumbnailKey,
  getThumbnail,
  getThumbnailsDir,
  isThumbnailDisabled,
  prewarmThumbnails
} from '../../../src/main/thumbnails/thumbnailService';

describe('thumbnailService Comprehensive Tests', () => {
  let tempDir: string;
  let sampleTextFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-thumb-test-'));
    process.env.NORA_USER_DATA = tempDir;
    sampleTextFile = path.join(tempDir, 'dummy.txt');
    fs.writeFileSync(sampleTextFile, 'not-an-image-content');
  });

  afterEach(() => {
    delete process.env.NORA_DISABLE_THUMBNAILS;
    delete process.env.VITE_DISABLE_THUMBNAILS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. computes deterministic SHA1 key from filePath, mtimeMs, and size', () => {
    const key1 = computeThumbnailKey('C:/music/cover.jpg', 123456789, 50000);
    const key2 = computeThumbnailKey('C:/music/cover.jpg', 123456789, 50000);
    const key3 = computeThumbnailKey('C:/music/cover.jpg', 999999999, 50000);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toMatch(/^[0-9a-f]{40}$/);
  });

  it('2. detects disabled state via NORA_DISABLE_THUMBNAILS env var', () => {
    expect(isThumbnailDisabled()).toBe(false);

    process.env.NORA_DISABLE_THUMBNAILS = '1';
    expect(isThumbnailDisabled()).toBe(true);

    delete process.env.NORA_DISABLE_THUMBNAILS;
    process.env.VITE_DISABLE_THUMBNAILS = '1';
    expect(isThumbnailDisabled()).toBe(true);
  });

  it('3. returns null immediately when disabled via kill-switch', async () => {
    process.env.NORA_DISABLE_THUMBNAILS = '1';
    const result = await getThumbnail(sampleTextFile);
    expect(result).toBeNull();
  });

  it('4. returns null for non-existent file paths', async () => {
    const missingPath = path.join(tempDir, 'does-not-exist.jpg');
    const result = await getThumbnail(missingPath);
    expect(result).toBeNull();
  });

  it('5. returns null and gracefully handles non-image content without crashing', async () => {
    const result = await getThumbnail(sampleTextFile);
    expect(result).toBeNull();
  });

  it('6. prewarmThumbnails respects disabled kill-switch and exits early', () => {
    process.env.NORA_DISABLE_THUMBNAILS = '1';
    // Should not throw and should exit immediately without scheduling work
    expect(() => prewarmThumbnails([sampleTextFile])).not.toThrow();
  });

  it('7. cleanThumbnailCache prunes files when total size exceeds maxSizeBytes', async () => {
    const thumbDir = getThumbnailsDir();
    fs.mkdirSync(thumbDir, { recursive: true });

    // Create two dummy thumbnail files
    const file1 = path.join(thumbDir, 'thumb1.jpg');
    const file2 = path.join(thumbDir, 'thumb2.jpg');
    fs.writeFileSync(file1, Buffer.alloc(100 * 1024, 0x11));
    fs.writeFileSync(file2, Buffer.alloc(100 * 1024, 0x22));

    // Threshold = 150 KB (less than 200 KB total)
    await cleanThumbnailCache(150 * 1024, 24 * 60 * 60 * 1000);

    const remaining = fs.readdirSync(thumbDir);
    expect(remaining.length).toBeLessThan(2);
  });

  it('8. cleanThumbnailCache deletes thumbnails older than maxAgeMs', async () => {
    const thumbDir = getThumbnailsDir();
    fs.mkdirSync(thumbDir, { recursive: true });

    const oldFile = path.join(thumbDir, 'old_thumb.jpg');
    fs.writeFileSync(oldFile, Buffer.alloc(1024, 0x33));

    // Artificially age the file by modifying its mtime
    const oldTime = (Date.now() - 100000) / 1000;
    fs.utimesSync(oldFile, oldTime, oldTime);

    // Prune anything older than 50 seconds
    await cleanThumbnailCache(500 * 1024 * 1024, 50 * 1000);

    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it('9. generates and caches a real thumbnail for valid image file', async () => {
    const sharp = (await import('sharp')).default;
    const testImage = path.join(tempDir, 'test.webp');
    await sharp({
      create: {
        width: 500,
        height: 500,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
      .webp()
      .toFile(testImage);

    const result = await getThumbnail(testImage);
    expect(result).not.toBeNull();
    expect(result?.buffer).toBeDefined();
    expect(result?.etag).toMatch(/"\d+-\d+-thumb"/);

    // Second call should hit the disk cache
    const cachedResult = await getThumbnail(testImage);
    expect(cachedResult?.buffer).toEqual(result?.buffer);
  });
});
