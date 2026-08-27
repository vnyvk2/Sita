import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { db } from '@main/db/db';
import { ASSET_EVENTS } from '../libraryChoreography';
import { replayGain } from '@main/db/schema';
import logger from '@main/logger';
import { getSongById } from '@main/db/queries/songs';
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

  private isCancelled(): boolean {
    return (this.state as JobState) === 'cancelled';
  }

  async execute(): Promise<void> {
    try {
      // 1. Check idempotency and version
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
      if (!song) return;

      if (this.isCancelled()) return;

      // 2. Perform EBU R128 loudness analysis
      // Note: Full LUFS analysis requires decoding the audio (e.g. ffmpeg or Web Audio API).
      // For this architectural proof, we simulate the intensive CPU work and return mock LUFS.
      // TODO: Replace with real LUFS analysis algorithm
      const lufsData = await this.analyzeLoudness(song.path);

      if (this.isCancelled()) return;

      // 3. Save to DB (One row per song containing track and album values)
      await db.transaction(async (trx) => {
        if (existing) {
          await trx.update(replayGain)
            .set({ 
              trackGain: lufsData.trackGain,
              trackPeak: lufsData.trackPeak,
              albumGain: lufsData.albumGain,
              albumPeak: lufsData.albumPeak,
              generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
              updatedAt: new Date()
            })
            .where(eq(replayGain.songId, this.songId));
        } else {
          await trx.insert(replayGain).values({
            songId: this.songId,
            trackGain: lufsData.trackGain,
            trackPeak: lufsData.trackPeak,
            albumGain: lufsData.albumGain,
            albumPeak: lufsData.albumPeak,
            generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION
          });
        }
      });

      // 4. Emit completion event
      this.eventBus.emit(ASSET_EVENTS.REPLAYGAIN_CREATED, {
        songId: this.songId,
        trackGain: lufsData.trackGain,
        trackPeak: lufsData.trackPeak
      });

    } catch (error) {
      logger.error(`[ReplayGainJob] Failed to analyze loudness for song ${this.songId}`, { error });
      throw error;
    }
  }

  private async analyzeLoudness(audioPath: string) {
    // Simulate CPU intensive task
    const stats = await fs.stat(audioPath);
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Mock ReplayGain logic (-14 LUFS is a common target)
    const mockTrackGain = (Math.sin(stats.size) * -5) - 5; // e.g. -5 to -10 dB
    const mockTrackPeak = 0.9 + (Math.cos(stats.size) * 0.1); // e.g. 0.8 to 1.0

    return {
      trackGain: mockTrackGain,
      trackPeak: mockTrackPeak,
      albumGain: mockTrackGain, // For full implementation, this requires analyzing the whole album
      albumPeak: mockTrackPeak
    };
  }
}
