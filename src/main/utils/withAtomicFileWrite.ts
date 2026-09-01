import { randomBytes } from 'crypto';
import { copyFile, rename, rm } from 'fs/promises';
import path from 'path';

import { File } from 'node-taglib-sharp';

import logger from '../logger';

/**
 * Atomic physical tag write.
 *
 * Strategy: copy the original to a temp sibling, run mutations against the copy, save it, dispose
 * the handle, then rename over the original.
 *
 * Invariants: - A failed mutation/save can NEVER leave a partially written original - the original
 * is only replaced by a fully saved temp file. - The temp handle is disposed BEFORE the rename
 * (required on Windows, otherwise the open handle makes the rename fail with EBUSY). - On any
 * failure the temp file is removed and the error rethrown; callers see the same failure surface as
 * before.
 *
 * The callback receives the COPY and must not call save() itself - saving is owned here so it
 * cannot be skipped or duplicated accidentally.
 */
export async function withAtomicFileWrite<T>(
  filePath: string,
  mutate: (file: File) => Promise<T> | T
): Promise<T> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(
    dir,
    `.${base}.${randomBytes(5).toString('hex')}.nora-tmp${path.extname(filePath)}`
  );

  try {
    // Seed the temp with the current container so TagLib# always parses a
    // valid audio file, regardless of how broken the in-progress state gets.
    await copyFile(filePath, tempPath);

    const file = File.createFromPath(tempPath);
    let result: T;
    try {
      result = await mutate(file);
      file.save();
    } finally {
      try {
        file.dispose();
      } catch (disposeError) {
        logger.warn('Failed disposing temp taglib handle', { disposeError, tempPath });
      }
    }

    await rename(tempPath, filePath);
    return result;
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
