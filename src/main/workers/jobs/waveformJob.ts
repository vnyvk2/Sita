import { app } from 'electron';
import { eq } from 'drizzle-orm';
import path from 'path';
import { EventEmitter } from 'events';
import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import logger from '@main/logger';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../libraryChoreography';
import type { Job, JobClass, JobState } from '../types';

export const CURRENT_WAVEFORM_GENERATOR_VERSION = 1;
export const WAVEFORM_RESOLUTION = 200; // Number of peak data points

export class WaveformJob implements Job {
  id: string;
  type = 'waveform';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  description: string;

  public songId: number;
  public songPath: string;
  private eventBus: EventEmitter;

  constructor(
    songId: number,
    songPath: string,
    songTitle: string,
    eventBus: EventEmitter,
    jobClass: JobClass = 'background'
  ) {
    this.songId = songId;
    this.songPath = songPath;
    this.eventBus = eventBus;
    this.id = `waveform_${songId}`;
    this.jobClass = jobClass;
    this.description = `Generating waveform for "${songTitle}"`;
  }

  async execute(): Promise<void> {
    try {
      // 1. Check idempotency and version in DB
      const existing = await db.query.waveforms.findFirst({
        where: (w, { eq }) => eq(w.songId, this.songId)
      });

      if (existing && CURRENT_WAVEFORM_GENERATOR_VERSION <= existing.generatorVersion) {
        logger.debug(`[WaveformJob] Song ${this.songId} already has a waveform (up to date).`);
        this.eventBus.emit(ASSET_EVENTS.WAVEFORM_CREATED, {
          songId: this.songId,
          path: existing.path
        });
        return;
      }

      if (existing) {
        logger.debug(`[WaveformJob] Song ${this.songId} waveform is outdated. Regenerating.`);
      }

      if (this.state === 'cancelled') return;

      // 2. Determine target destination file path
      const cacheDir = path.join(app.getPath('userData'), 'cache', 'waveforms');
      const fileName = `${this.songId}_v${CURRENT_WAVEFORM_GENERATOR_VERSION}.bin`;
      const filePath = path.join(cacheDir, fileName);

      // 3. Delegate CPU peak generation & atomic file writing to mediaWorker
      const result = await mediaWorkerBridge.generateAsset({
        jobType: 'waveform',
        sourceFilePath: this.songPath,
        destinationPath: filePath,
        metadata: {
          songId: this.songId,
          version: CURRENT_WAVEFORM_GENERATOR_VERSION
        }
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to generate waveform for song ${this.songId}`);
      }

      if (this.state === 'cancelled') return;

      // 4. Save to DB (Main owns all database mutations)
      await db.transaction(async (trx) => {
        if (existing) {
          // Update existing
          await trx.update(waveforms)
            .set({ 
              path: filePath, 
              resolution: WAVEFORM_RESOLUTION, 
              generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION,
              updatedAt: new Date()
            })
            .where(eq(waveforms.songId, this.songId));
        } else {
          // Insert new
          await trx.insert(waveforms).values({
            songId: this.songId,
            path: filePath,
            resolution: WAVEFORM_RESOLUTION,
            generatorVersion: CURRENT_WAVEFORM_GENERATOR_VERSION
          });
        }
      });

      // 5. Post-commit guarantee: emit event only after successful DB transaction
      this.eventBus.emit(ASSET_EVENTS.WAVEFORM_CREATED, {
        songId: this.songId,
        path: filePath
      });

    } catch (error) {
      logger.error(`[WaveformJob] Failed to generate waveform for song ${this.songId}`, { error });
      throw error;
    }
  }
}
