import { app } from 'electron';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import type { Stats } from 'fs';
import path from 'path';

import { collectGarbageArtworks } from '@main/core/garbageCollector';
import { db } from '@main/db/db';
import { waveforms } from '@main/db/schema';
import logger from '@main/logger';
import { isAnErrorWithCode } from '@main/utils/isAnErrorWithCode';
import { atomicPublishFile, isAssetTempFileFor } from '@main/workers/process/handlers/assetJobHandler';
import { WAVEFORM_RESOLUTION } from './waveformJob';
import type { Job, JobClass, JobState } from '../types';

export class GarbageCollectionJob implements Job {
  id: string;
  type = 'garbage_collection';
  jobClass: JobClass = 'maintenance';
  state: JobState = 'queued'; // Using 'queued' instead of 'pending' as JobState has 'queued'
  retries = 0;
  description: string;
  private abortController = new AbortController();
  
  // Provide a unique id so that multiple GC jobs don't queue up unnecessarily
  constructor() {
    this.id = 'garbage_collection_job';
    this.description = 'Collecting orphaned library assets';
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
      if (this.isCancelled()) return;
      logger.info('Starting garbage collection for orphaned library assets');
      const removedCount = await collectGarbageArtworks();
      if (this.isCancelled()) return;
      logger.info(`Garbage collection completed. Removed ${removedCount} orphaned artworks.`);

      logger.info('Starting garbage collection for orphaned waveforms');
      const removedWaveforms = await this.collectGarbageWaveforms();
      logger.info(`Garbage collection completed. Removed ${removedWaveforms} orphaned waveforms.`);
    } catch (error) {
      logger.error('Garbage collection job failed', { error });
      throw error;
    }
  }

  private async collectGarbageWaveforms(): Promise<number> {
    try {
      const cacheDir = path.join(app.getPath('userData'), 'cache', 'waveforms');
      
      let files: string[] = [];
      try {
        files = await fs.readdir(cacheDir);
      } catch (e) {
        if (isAnErrorWithCode(e) && e.code === 'ENOENT') return 0;
        throw e;
      }
      
      const now = Date.now();
      let removedCount = 0;

      const dbWaveforms = await db.select({ id: waveforms.id, path: waveforms.path }).from(waveforms);
      const validBinPaths = new Set(dbWaveforms.map((w) => path.basename(w.path)));

      // 1. Crash recovery & in-flight protection for DB rows
      for (const row of dbWaveforms) {
        if (this.isCancelled()) return removedCount;
        const fileExists = await fs.stat(row.path).then(() => true).catch(() => false);
        if (!fileExists) {
          const rowBasename = path.basename(row.path);
          const matchingTempFiles = files.filter((f) => isAssetTempFileFor(f, rowBasename));

          let protectedInFlight = false;
          let recovered = false;

          // Collect stats for all matching candidate files
          const candidateEntries = await Promise.all(
            matchingTempFiles.map(async (tempFileName) => {
              const tempFilePath = path.join(cacheDir, tempFileName);
              const tempStats = await fs.stat(tempFilePath).catch(() => null);
              return { tempFileName, tempFilePath, tempStats };
            })
          );

          // 1. Check if any matching temp file is active / in-flight (<60s)
          const hasActiveInFlight = candidateEntries.some(
            (c) => c.tempStats && now - c.tempStats.mtimeMs < 60_000
          );

          if (hasActiveInFlight) {
            logger.debug(
              `[GarbageCollection] Waveform ${row.id} has active in-flight temp file. Preserving DB row.`
            );
            protectedInFlight = true;
          } else {
            // 2. Deterministic crash recovery: Sort stale candidates newest first
            const staleCandidates = candidateEntries
              .filter((c): c is { tempFileName: string; tempFilePath: string; tempStats: Stats } => c.tempStats !== null)
              .sort((a, b) => b.tempStats.mtimeMs - a.tempStats.mtimeMs);

            if (staleCandidates.length > 0) {
              const newestCandidate = staleCandidates[0];
              // Nora waveforms are raw Float32Array data with WAVEFORM_RESOLUTION (200) peaks.
              // Expected file size = WAVEFORM_RESOLUTION * Float32Array.BYTES_PER_ELEMENT = 800 bytes.
              // Reject files that don't match the expected format.
              const EXPECTED_WAVEFORM_BYTES = WAVEFORM_RESOLUTION * Float32Array.BYTES_PER_ELEMENT;
              const { size } = newestCandidate.tempStats;
              const isValidWaveform = size === EXPECTED_WAVEFORM_BYTES;
              if (!isValidWaveform) {
                logger.warn(
                  `[GarbageCollection] Rejecting corrupt/truncated waveform tmp file for DB row ${row.id}: ` +
                  `${newestCandidate.tempFilePath} (${size} bytes, expected ${EXPECTED_WAVEFORM_BYTES} bytes)`
                );
                continue;
              }

              logger.info(
                `[GarbageCollection] Recovering newest unpromoted waveform tmp file for DB row ${row.id}: ${newestCandidate.tempFilePath} -> ${row.path}`
              );

              try {
                const pubStatus = await atomicPublishFile(newestCandidate.tempFilePath, row.path);
                if (pubStatus === 'published' || pubStatus === 'already_existed') {
                  recovered = true;
                }
              } catch (err) {
                logger.warn(`[GarbageCollection] Failed to promote recovered waveform tmp file`, {
                  error: err
                });
              }
            }
          }

          if (protectedInFlight || recovered) continue;

          // Neither final .bin nor valid in-flight/recoverable .tmp exists
          logger.warn(
            `[GarbageCollection] Waveform DB row ${row.id} points to missing file ${row.path}. Removing orphaned row.`
          );
          await db.delete(waveforms).where(eq(waveforms.id, row.id));
        }
      }

      // 2. Clean stale .tmp files (>60s old)
      // Any .tmp file older than 60s that remains after Step 1 (e.g. leftover when .bin already exists,
      // or unreferenced without DB row) is obsolete and must be deleted.
      for (const file of files) {
        if (this.isCancelled()) return removedCount;
        if (file.endsWith('.tmp')) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && now - stats.mtimeMs > 60_000) {
            await fs.unlink(filePath).catch((err) => {
              logger.warn(`Failed to delete stale waveform tmp file ${filePath}`, { error: err });
            });
            removedCount++;
          }
        }
      }

      // 3. Clean unreferenced .bin files (>60s old and not referenced in DB)
      for (const file of files) {
        if (this.isCancelled()) return removedCount;
        if (file.endsWith('.bin') && !validBinPaths.has(file)) {
          const filePath = path.join(cacheDir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats && now - stats.mtimeMs > 60_000) {
            await fs.unlink(filePath).catch((err) => {
              logger.warn(`Failed to delete orphaned waveform ${filePath}`, { error: err });
            });
            removedCount++;
          }
        }
      }
      
      return removedCount;
    } catch (error) {
      logger.error('Failed to collect garbage waveforms', { error });
      throw error;
    }
  }
}
