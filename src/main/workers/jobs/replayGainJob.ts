import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { db } from '@main/db/db';
import { getSongById } from '@main/db/queries/songs';
import { replayGain } from '@main/db/schema';
import logger from '@main/logger';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../libraryChoreography';
import type { Job, JobClass, JobState } from '../types';

export const CURRENT_REPLAYGAIN_GENERATOR_VERSION = 1;

export class ReplayGainJob implements Job {
  id: string;
  type = 'replaygain';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  maxRetries = 2;
  description: string;

  public songId: number;
  private eventBus: EventEmitter;

  constructor(
    songId: number,
    songTitle: string,
    eventBus: EventEmitter,
    jobClass: JobClass = 'background'
  ) {
    this.songId = songId;
    this.eventBus = eventBus;
    this.id = `replaygain_${songId}`;
    this.jobClass = jobClass;
    this.description = `Analyzing loudness for "${songTitle}"`;
  }

  async execute(): Promise<void> {
    try {
      // 1. Check idempotency and version in DB
      const existing = await db.query.replayGain.findFirst({
        where: (rg, { eq }) => eq(rg.songId, this.songId)
      });

      if (existing && CURRENT_REPLAYGAIN_GENERATOR_VERSION <= existing.generatorVersion) {
        logger.debug(`[ReplayGainJob] Song ${this.songId} already has ReplayGain (up to date).`);
        return;
      }

      if (existing) {
        logger.debug(`[ReplayGainJob] Song ${this.songId} ReplayGain is outdated. Regenerating.`);
      }

      const song = await getSongById(this.songId);
      if (!song) {
        logger.warn(`[ReplayGainJob] Song ${this.songId} not found, aborting.`);
        return;
      }

      if (this.state === 'cancelled') return;

      // 2. Delegate CPU loudness analysis to utilityProcess worker
      const result = await mediaWorkerBridge.generateAsset({
        jobType: 'replaygain',
        sourceFilePath: song.path,
        destinationPath: '',
        metadata: {
          songId: this.songId,
          version: CURRENT_REPLAYGAIN_GENERATOR_VERSION
        }
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to analyze ReplayGain for song ${this.songId}`);
      }

      if (this.state === 'cancelled') return;

      const trackGain = result.metadata?.trackGain as number;
      const trackPeak = result.metadata?.trackPeak as number;
      const albumGain = result.metadata?.albumGain as number;
      const albumPeak = result.metadata?.albumPeak as number;

      // 3. Save to DB in Main process
      await db.transaction(async (trx) => {
        if (existing) {
          await trx
            .update(replayGain)
            .set({
              trackGain,
              trackPeak,
              albumGain,
              albumPeak,
              generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
              updatedAt: new Date()
            })
            .where(eq(replayGain.songId, this.songId));
        } else {
          await trx.insert(replayGain).values({
            songId: this.songId,
            trackGain,
            trackPeak,
            albumGain,
            albumPeak,
            generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
          });
        }
      });

      // 4. Post-commit event emission
      this.eventBus.emit(ASSET_EVENTS.REPLAYGAIN_CREATED, {
        songId: this.songId,
        trackGain,
        trackPeak
      });
    } catch (error) {
      logger.error(`[ReplayGainJob] Failed to analyze loudness for song ${this.songId}`, { error });
      throw error;
    }
  }
}
