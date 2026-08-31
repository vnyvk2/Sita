import fs from 'fs';

import { db } from '../db/db';
import logger from '../logger';
import { WAVEFORM_RESOLUTION } from '../workers/jobs/waveformJob';

/**
 * Retrieves the cached 200-bin peak waveform data for a song. Defensively validates file existence,
 * byte size, finite numbers, and bounds [0.0, 1.0].
 *
 * @param songId Unique identifier of the song
 * @returns Validated Float32Array of 200 peak amplitude values, or null if unavailable/corrupted
 */
export const getSongWaveform = async (songId: number): Promise<Float32Array | null> => {
  try {
    if (typeof songId !== 'number' || songId <= 0 || !Number.isInteger(songId)) {
      return null;
    }

    const row = await db.query.waveforms.findFirst({
      where: (w, { eq }) => eq(w.songId, songId)
    });

    if (!row || !row.path) return null;

    // Expected byte count: WAVEFORM_RESOLUTION (200) * 4 bytes per Float32 = 800 bytes
    const EXPECTED_BYTES = WAVEFORM_RESOLUTION * Float32Array.BYTES_PER_ELEMENT;
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(row.path);
    } catch {
      return null;
    }

    if (stats.size !== EXPECTED_BYTES) {
      logger.warn(
        `[getSongWaveform] Invalid file size (${stats.size} bytes vs expected ${EXPECTED_BYTES} bytes) for song ${songId}`
      );
      return null;
    }

    const fileBuffer = await fs.promises.readFile(row.path);
    if (fileBuffer.byteLength !== EXPECTED_BYTES) return null;

    const rawFloats = new Float32Array(
      fileBuffer.buffer,
      fileBuffer.byteOffset,
      WAVEFORM_RESOLUTION
    );

    // Defensive normalization and sanity check
    const validatedPeaks = new Float32Array(WAVEFORM_RESOLUTION);
    for (let i = 0; i < WAVEFORM_RESOLUTION; i++) {
      const val = rawFloats[i];
      if (Number.isFinite(val)) {
        validatedPeaks[i] = Math.max(0, Math.min(1, val));
      } else {
        validatedPeaks[i] = 0;
      }
    }

    return validatedPeaks;
  } catch (err) {
    logger.error(`[getSongWaveform] Error fetching waveform for song ${songId}:`, err);
    return null;
  }
};

export default getSongWaveform;
