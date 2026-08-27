import { readFile } from 'fs/promises';

import logger from '../logger';

/**
 * Reads a local file into a Buffer for artwork processing. Standalone filesystem utility with zero
 * dependencies on IPC, main, or collections setup.
 */
export const generateLocalArtworkBuffer = (filePath: string): Promise<Buffer | undefined> =>
  readFile(filePath).catch((err) => {
    logger.error(`Error occurred when trying to generate buffer of the song artwork.`, {
      err,
      filePath
    });
    return undefined;
  });
