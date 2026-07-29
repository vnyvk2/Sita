import { collectGarbageArtworks } from '@main/core/garbageCollector';
import type { Job, JobClass, JobState } from '../types';
import logger from '@main/logger';

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
    } catch (error) {
      logger.error('Garbage collection job failed', { error });
      throw error;
    }
  }
}
