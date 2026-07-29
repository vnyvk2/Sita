import { app } from 'electron';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import logger from '@main/logger';
import { ASSET_EVENTS } from '../libraryChoreography';
import type { Job, JobClass, JobState } from '../types';

export const CURRENT_WAVEFORM_GENERATOR_VERSION = 1;
const WAVEFORM_RESOLUTION = 200; // Number of peak data points

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
      // 1. Check idempotency and version
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

      // 2. Generate Peaks
      const peaks = await this.generatePeaks(this.songPath);

      if (this.state === 'cancelled') return;

      // 3. Serialize to .bin file
      const cacheDir = path.join(app.getPath('userData'), 'cache', 'waveforms');
      await fs.mkdir(cacheDir, { recursive: true });
      
      const fileName = `${this.songId}_v${CURRENT_WAVEFORM_GENERATOR_VERSION}.bin`;
      const filePath = path.join(cacheDir, fileName);
      
      const buffer = Buffer.from(peaks.buffer);
      await fs.writeFile(filePath, buffer);

      // 4. Save to DB
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

      // 5. Emit event
      this.eventBus.emit(ASSET_EVENTS.WAVEFORM_CREATED, {
        songId: this.songId,
        path: filePath
      });

    } catch (error) {
      logger.error(`[WaveformJob] Failed to generate waveform for song ${this.songId}`, { error });
      throw error;
    }
  }

  /**
   * Reads audio file and extracts normalized peaks.
   * NOTE: A true implementation in Node.js requires decoding the audio format (MP3/FLAC).
   * For the architectural proof, we generate deterministic peaks based on file size.
   */
  private async generatePeaks(audioPath: string): Promise<Float32Array> {
    const stats = await fs.stat(audioPath);
    const peaks = new Float32Array(WAVEFORM_RESOLUTION);
    
    // Generate deterministic "peaks" for testing the architecture
    for (let i = 0; i < WAVEFORM_RESOLUTION; i++) {
      const val = Math.abs(Math.sin((stats.size + i) * 0.01)) * 0.9 + 0.1;
      peaks[i] = val;
    }
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return peaks;
  }
}
