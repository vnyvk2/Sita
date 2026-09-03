import crypto from 'crypto';
import { existsSync, promises as fsp } from 'fs';
import os from 'os';
import path from 'path';

import { app } from 'electron';
import sharp from 'sharp';

import logger from '../logger';

export interface ThumbnailResult {
  buffer: Buffer;
  etag: string;
}

export const isThumbnailDisabled = (): boolean => {
  return (
    process.env.NORA_DISABLE_THUMBNAILS === '1' || process.env.VITE_DISABLE_THUMBNAILS === '1'
  );
};

export const getThumbnailsDir = (): string => {
  const baseDir =
    app && typeof app.getPath === 'function'
      ? app.getPath('userData')
      : process.env.NORA_USER_DATA || os.tmpdir();
  return path.join(baseDir, 'thumbnails');
};

// In-flight deduplication to avoid redundant resizes during rapid scrolling
const inFlight = new Map<string, Promise<ThumbnailResult | null>>();

// Negative cache for corrupted / un-decodable files (bounded to 128 entries)
const MAX_FAILED_KEYS = 128;
const failedKeys = new Set<string>();

const markFailed = (key: string): void => {
  if (failedKeys.size >= MAX_FAILED_KEYS) {
    const first = failedKeys.values().next().value;
    if (first) failedKeys.delete(first);
  }
  failedKeys.add(key);
};

export const computeThumbnailKey = (filePath: string, mtimeMs: number, size: number): string => {
  return crypto.createHash('sha1').update(`${filePath}:${mtimeMs}:${size}`).digest('hex');
};

export const getThumbnail = async (filePath: string): Promise<ThumbnailResult | null> => {
  if (isThumbnailDisabled()) return null;

  try {
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile()) return null;

    const mtimeMs = Math.trunc(stat.mtimeMs);
    const key = computeThumbnailKey(filePath, mtimeMs, stat.size);
    const etag = `"${stat.size}-${mtimeMs}-thumb"`;

    if (failedKeys.has(key)) return null;

    const thumbDir = getThumbnailsDir();
    const thumbPath = path.join(thumbDir, `${key}.jpg`);

    // Check disk cache
    const cached = await fsp.readFile(thumbPath).catch(() => null);
    if (cached) {
      return { buffer: cached, etag };
    }

    // In-flight deduplication
    const existing = inFlight.get(key);
    if (existing) return existing;

    const job = (async (): Promise<ThumbnailResult | null> => {
      try {
        const jpegBuffer = await sharp(filePath)
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        if (!jpegBuffer || jpegBuffer.length === 0) {
          markFailed(key);
          return null;
        }

        await fsp.mkdir(thumbDir, { recursive: true });
        await fsp.writeFile(thumbPath, jpegBuffer).catch((err) => {
          logger.warn('Failed to write thumbnail cache file', { thumbPath, err });
        });

        return { buffer: jpegBuffer, etag };
      } catch (err) {
        logger.debug('Error generating thumbnail', { filePath, err });
        markFailed(key);
        return null;
      }
    })();

    inFlight.set(
      key,
      job.finally(() => {
        inFlight.delete(key);
      })
    );

    return await job;
  } catch (err) {
    logger.debug('Failed to get thumbnail', { filePath, err });
    return null;
  }
};

/**
 * Prewarm thumbnails in the background when the library lifecycle settles.
 * Respects the kill-switch so control runs are never contaminated.
 */
export const prewarmThumbnails = (filePaths: readonly string[]): void => {
  if (isThumbnailDisabled()) return;

  // Run asynchronously in low-priority background queue
  const queue = [...filePaths];
  const BATCH_SIZE = 4;
  const BATCH_INTERVAL_MS = 150;

  const processBatch = async () => {
    if (isThumbnailDisabled() || queue.length === 0) return;

    const batch = queue.splice(0, BATCH_SIZE);
    await Promise.allSettled(batch.map((fp) => getThumbnail(fp)));

    if (queue.length > 0) {
      setTimeout(processBatch, BATCH_INTERVAL_MS);
    }
  };

  setTimeout(processBatch, 500);
};

/**
 * Startup cleanup hook to keep the disk cache bounded.
 */
export const cleanThumbnailCache = async (
  maxSizeBytes = 512 * 1024 * 1024,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000
): Promise<void> => {
  try {
    const dir = getThumbnailsDir();
    if (!existsSync(dir)) return;

    const entries = await fsp.readdir(dir).catch(() => []);
    const now = Date.now();
    let totalSize = 0;
    const fileStats: { filePath: string; mtimeMs: number; size: number }[] = [];

    for (const file of entries) {
      if (!file.endsWith('.jpg')) continue;
      const fullPath = path.join(dir, file);
      const stat = await fsp.stat(fullPath).catch(() => null);
      if (!stat) continue;

      if (now - stat.mtimeMs > maxAgeMs) {
        await fsp.unlink(fullPath).catch(() => null);
      } else {
        totalSize += stat.size;
        fileStats.push({ filePath: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    }

    if (totalSize > maxSizeBytes) {
      fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const item of fileStats) {
        await fsp.unlink(item.filePath).catch(() => null);
        totalSize -= item.size;
        if (totalSize <= maxSizeBytes * 0.75) break;
      }
    }
  } catch (err) {
    logger.warn('Failed cleaning thumbnail cache', { err });
  }
};
