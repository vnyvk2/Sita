import { db } from '@main/db/db';
import logger from '@main/logger';
import generatePalette, { savePalette } from '@main/other/generatePalette';
import generateCoverBuffer from '@main/parseSong/generateCoverBuffer';

import type { Job, JobClass, JobState } from '../types';

export const CURRENT_PALETTE_GENERATOR_VERSION = 1;

export class PaletteJob implements Job {
  id: string;
  type = 'palette';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  description: string;

  public artworkId: number;
  public artworkPath: string;

  constructor(
    artworkId: number,
    artworkPath: string,
    albumTitle: string,
    jobClass: JobClass = 'interactive'
  ) {
    this.artworkId = artworkId;
    this.artworkPath = artworkPath;
    this.id = `palette_${artworkId}`;
    this.jobClass = jobClass;
    this.description = `Generating color palette for "${albumTitle}"`;
  }

  async execute(): Promise<void> {
    try {
      // 1. Idempotency: Does it already have a palette?
      const existing = await db.query.palettes.findFirst({
        where: (p, { eq }) => eq(p.artworkId, this.artworkId)
      });

      if (existing && CURRENT_PALETTE_GENERATOR_VERSION <= existing.generatorVersion) {
        logger.debug(`[PaletteJob] Artwork ${this.artworkId} already has a palette (up to date).`);
        return;
      }
      if (existing) {
        logger.debug(`[PaletteJob] Artwork ${this.artworkId} palette is outdated. Regenerating.`);
      }

      // 2. Generate palette
      const buffer = await generateCoverBuffer(this.artworkPath, false);
      const palette = await generatePalette(buffer);

      // 3. Save palette
      if (palette) {
        await db.transaction(async (trx) => {
          await savePalette(this.artworkId, palette, trx);
        });
      }
    } catch (error) {
      logger.error(`[PaletteJob] Failed to generate palette for artwork ${this.artworkId}`, {
        error
      });
      throw error;
    }
  }
}
