import { app } from 'electron';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

import { collectGarbageArtworks } from '@main/core/garbageCollector';
import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import logger from '@main/logger';
import type { Job, JobClass, JobState } from '../types';

export class GarbageCollectionJob implements Job {
  id: string;
  type = 'garbage_collection';
  jobClass: JobClass = 'maintenance';
  state: JobState = 'queued'; // Using 'queued' instead of 'pending' as JobState has 'queued'
  retries = 0;
  description: string;
  
  // Provide a unique id so that multiple GC jobs don't queue up unnecessarily
  constructor() {
    this.id = 'garbage_collection_job';
    this.description = 'Collecting orphaned library assets';
  }

  async execute(): Promise<void> {
    try {
      logger.info('Starting garbage collection for orphaned library assets');
      const removedCount = await collectGarbageArtworks();
      logger.info(`Garbage collection completed. Removed ${removedCount} orphaned artworks.`);

      logger.info('Starting garbage collection for orphaned waveforms');
      const removedWaveforms = await this.collectGarbageWaveforms();
      logger.info(`Garbage collection completed. Removed ${removedWaveforms} orphaned waveforms.`);
    } catch (error) {
      logger.error('Garbage collection job failed', { error });
      throw error;
    }
  }

  private async collectGarbageWaveforms(): Promise<number> {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'cache', 'waveforms');
      
      let files: string[] = [];
      try {
        files = await fs.readdir(cacheDir);
      } catch (e: any) {
        if (e.code === 'ENOENT') return 0;
        throw e;
      }
      
      const now = Date.now();
      let removedCount = 0;

      const dbWaveforms = await db.select({ id: waveforms.id, path: waveforms.path }).from(waveforms);
      const validBinPaths = new Set(dbWaveforms.map((w) => path.basename(w.path)));
      const validTmpPaths = new Set(dbWaveforms.map((w) => `${path.basename(w.path)}.tmp`));

      // 1. Crash recovery & in-flight protection for DB rows
      for (const row of dbWaveforms) {
        const fileExists = await fs.stat(row.path).then(() => true).catch(() => false);
        if (!fileExists) {
          const tempPath = `${row.path}.tmp`;
          const tempStats = await fs.stat(tempPath).catch(() => null);

          if (tempStats) {
            if (now - tempStats.mtimeMs < 60_000) {
              // In-flight publication race protection: file is actively being written/renamed
              logger.debug(`[GarbageCollection] Waveform ${row.id} has active in-flight temp file. Preserving DB row.`);
              continue;
            } else {
              // Crash recovery: Process crashed after DB commit but before rename
              // Deterministic promotion of matching temp file restores published asset
              logger.info(`[GarbageCollection] Recovering unpromoted waveform tmp file for DB row ${row.id}: ${tempPath} -> ${row.path}`);
              const promoted = await fs.rename(tempPath, row.path).then(() => true).catch((err) => {
                logger.warn(`[GarbageCollection] Failed to promote recovered waveform tmp file`, { error: err });
                return false;
              });
              if (promoted) continue;
            }
          }

          // Neither final .bin nor valid in-flight/recoverable .tmp exists
          logger.warn(`[GarbageCollection] Waveform DB row ${row.id} points to missing file ${row.path}. Removing orphaned row.`);
          await db.delete(waveforms).where(eq(waveforms.id, row.id));
        }
      }

      // 2. Clean unreferenced .tmp files (>60s old and not associated with any active DB row)
      for (const file of files) {
        if (file.endsWith('.tmp') && !validTmpPaths.has(file)) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && now - stats.mtimeMs > 60_000) {
            await fs.unlink(filePath).catch((err) => {
              logger.warn(`Failed to delete stale unreferenced waveform tmp file ${filePath}`, { error: err });
            });
            removedCount++;
          }
        }
      }

      // 3. Clean unreferenced .bin files (>60s old and not referenced in DB)
      for (const file of files) {
        if (file.endsWith('.bin') && !validBinPaths.has(file)) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && now - stats.mtimeMs > 60_000) {
            await fs.unlink(filePath).catch((err) => {
              logger.warn(`Failed to delete orphaned waveform ${filePath}`, { error: err });
            });
            removedCount++;
          }
        }
      }
      
      return removedCount;
    } catch (error) {
      logger.error('Failed to collect garbage waveforms', { error });
      throw error;
    }
  }
}
