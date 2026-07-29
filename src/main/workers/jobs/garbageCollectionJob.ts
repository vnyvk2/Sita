import { collectGarbageArtworks } from '@main/core/garbageCollector';
import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import logger from '@main/logger';
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
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
      
      const dbWaveforms = await db.select({ path: waveforms.path }).from(waveforms);
      const validPaths = new Set(dbWaveforms.map((w) => path.basename(w.path)));
      
      let removedCount = 0;
      for (const file of files) {
        if (file.endsWith('.bin') && !validPaths.has(file)) {
          const filePath = path.join(cacheDir, file);
          await fs.unlink(filePath).catch((err) => {
            logger.warn(`Failed to delete orphaned waveform ${filePath}`, { error: err });
          });
          removedCount++;
        }
      }
      
      return removedCount;
    } catch (error) {
      logger.error('Failed to collect garbage waveforms', { error });
      throw error;
    }
  }
}
