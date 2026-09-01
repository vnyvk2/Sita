import { EventEmitter } from 'events';
import path from 'path';

import { db } from '@main/db/db';
import { getSongById } from '@main/db/queries/songs';
import { replayGain } from '@main/db/schema';
import logger from '@main/logger';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { eq } from 'drizzle-orm';
import { app } from 'electron';

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
  private abortController = new AbortController();

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

  public cancel(): void {
    this.state = 'cancelled';
    this.abortController.abort();
  }

  public isCancelled(): boolean {
    return this.state === 'cancelled' || this.abortController.signal.aborted;
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

      if (this.isCancelled()) return;

      // 2. Delegate CPU loudness analysis to utilityProcess worker
      const destinationPath = app?.getPath
        ? path.join(
            app.getPath('userData'),
            'loudness_blocks',
            `${this.songId}_v${CURRENT_REPLAYGAIN_GENERATOR_VERSION}.bin`
          )
        : '';

      const result = await mediaWorkerBridge.generateAsset({
        jobType: 'replaygain',
        sourceFilePath: song.path,
        destinationPath,
        abortSignal: this.abortController.signal,
        metadata: {
          songId: this.songId,
          version: CURRENT_REPLAYGAIN_GENERATOR_VERSION
        }
      });

      if (result.cancelled || this.isCancelled()) return;
      if (!result.success) {
        if (result.metadata?.method === 'unsupported_codec') {
          logger.debug(
            `[ReplayGainJob] Skipping unsupported codec for song ${this.songId}: ${song.path}`
          );
          return;
        }
        throw new Error(`[ReplayGainJob] Failed to analyze loudness for song ${this.songId}`);
      }

      const trackGain = result.metadata?.trackGain as number;
      const trackPeak = result.metadata?.trackPeak as number;

      // Check if song is linked to an album
      const albumSong = await db.query.albumsSongs.findFirst({
        where: (as, { eq }) => eq(as.songId, this.songId)
      });
      const albumId = albumSong?.albumId;

      // 3. Save to DB in Main process
      await db.transaction(async (trx) => {
        if (existing) {
          await trx
            .update(replayGain)
            .set({
              trackGain,
              trackPeak,
              albumGain: null,
              albumPeak: null,
              generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
              updatedAt: new Date()
            })
            .where(eq(replayGain.songId, this.songId));
        } else {
          await trx.insert(replayGain).values({
            songId: this.songId,
            trackGain,
            trackPeak,
            albumGain: null,
            albumPeak: null,
            generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
          });
        }
      });

      // 4. Post-commit event emission
      this.eventBus.emit(ASSET_EVENTS.REPLAYGAIN_CREATED, {
        songId: this.songId,
        albumId,
        trackGain,
        trackPeak
      });
    } catch (error) {
      logger.error(`[ReplayGainJob] Failed to analyze loudness for song ${this.songId}`, { error });
      throw error;
    }
  }
}
