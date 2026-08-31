import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@main/db/db';
import { replayGain } from '@main/db/schema';
import logger from '@main/logger';
import {
  AlbumLoudnessAggregator,
  type TrackLoudnessData
} from '../process/audio/AlbumLoudnessAggregator';
import { ASSET_EVENTS } from '../libraryChoreography';
import { JobScheduler } from '../jobScheduler';
import type { Job, JobClass, JobState } from '../types';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION } from './replayGainJob';

/**
 * AlbumReplayGainJob
 *
 * Orchestrates album-level loudness aggregation across all tracks belonging to an album.
 *
 * Architectural & Invalidation Invariants:
 * 1. Generator Version: Both track DSP analysis and album aggregation share CURRENT_REPLAYGAIN_GENERATOR_VERSION (1).
 *    Whenever a track is analyzed or re-analyzed by ReplayGainJob, its albumGain and albumPeak are set to null,
 *    which immediately invalidates the album's cached metrics and triggers fresh aggregation.
 * 2. Block Cache Contract: Block caches on disk (loudness_blocks/${songId}_v1.bin) are intermediate 64-bit
 *    DSP artifacts used exclusively during album aggregation. When an album is already synchronized in DB
 *    (isUpToDate === true), the DB rows are authoritative. When aggregation is needed, block files must be
 *    valid and divisible by 8 bytes. Missing or corrupt caches defer aggregation until tracks are re-analyzed.
 * 3. True Optimistic Concurrency: Within the DB transaction, the row count is strictly verified against
 *    album songs, and every row is updated with a conditional `WHERE song_id = ? AND updated_at = ?` check.
 *    If any concurrent transaction updated a track between validation and commit, the transaction aborts and rolls back.
 */
export class AlbumReplayGainJob implements Job {
  id: string;
  type = 'album_replaygain';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  maxRetries = 2;
  description: string;

  public albumId: number;
  private scheduler: JobScheduler;

  constructor(
    albumId: number,
    scheduler: JobScheduler,
    jobClass: JobClass = 'background'
  ) {
    this.albumId = albumId;
    this.scheduler = scheduler;
    this.id = `album_replaygain_${albumId}`;
    this.jobClass = jobClass;
    this.description = `Aggregating album loudness for album ${albumId}`;
  }

  private abortController = new AbortController();

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

      // 1. Fetch all songs associated with this album
      const albumSongRows = await db.query.albumsSongs.findMany({
        where: (as, { eq: eq_ }) => eq_(as.albumId, this.albumId)
      });

      if (this.isCancelled()) return;

      if (albumSongRows.length === 0) {
        logger.debug(`[AlbumReplayGainJob] No songs found for album ${this.albumId}, skipping.`);
        return;
      }

      const songIds = albumSongRows.map((row) => row.songId);

      // 2. Fetch all replay_gain records for these songs
      const rgRows = await db.query.replayGain.findMany({
        where: (rg, { inArray: inArray_ }) => inArray_(rg.songId, songIds)
      });

      if (this.isCancelled()) return;

      // Completeness check: All songs in the album must have finished track ReplayGain analysis
      if (rgRows.length < songIds.length) {
        logger.debug(
          `[AlbumReplayGainJob] Incomplete album ${this.albumId} (${rgRows.length}/${songIds.length} tracks analyzed). Deferring re-evaluation.`
        );
        // Deferred re-enqueue: After this job completes and its ID is cleared from
        // activeJobIds, a fresh AlbumReplayGainJob will be enqueued to re-check.
        // This prevents permanent deferral when track completion events are suppressed
        // by deduplication while this job is still active.
        // Uses the scheduler's explicit deferred enqueue mechanism (not a fake domain event).
        this.scheduler.scheduleDeferred(
          new AlbumReplayGainJob(this.albumId, this.scheduler, this.jobClass),
          5000
        );
        return;
      }

      // 3. Up-To-Date Contract (Constraint #7):
      // An album is current iff every song in albumsSongs has:
      //   - generatorVersion >= CURRENT_REPLAYGAIN_GENERATOR_VERSION
      //   - non-null trackGain and non-null albumGain
      //   - all tracks share identical albumGain and albumPeak
      const firstAlbumGain = rgRows[0].albumGain;
      const firstAlbumPeak = rgRows[0].albumPeak;

      const isUpToDate =
        firstAlbumGain !== null &&
        firstAlbumPeak !== null &&
        rgRows.every(
          (rg) =>
            rg.generatorVersion >= CURRENT_REPLAYGAIN_GENERATOR_VERSION &&
            rg.trackGain !== null &&
            rg.albumGain !== null &&
            rg.albumGain === firstAlbumGain &&
            rg.albumPeak === firstAlbumPeak
        );

      if (isUpToDate) {
        logger.debug(`[AlbumReplayGainJob] Album ${this.albumId} ReplayGain is already up to date.`);
        return;
      }

      if (this.isCancelled()) return;

      // 4. Load 64-bit loudness block caches from disk (Constraint #1, #3)
      const tracksData: TrackLoudnessData[] = [];
      const userDataDir = app?.getPath ? app.getPath('userData') : '';

      for (const rg of rgRows) {
        const blockFilePath = path.join(
          userDataDir,
          'loudness_blocks',
          `${rg.songId}_v${CURRENT_REPLAYGAIN_GENERATOR_VERSION}.bin`
        );

        try {
          const buf = await fs.readFile(blockFilePath);

          // Robust validation: must be non-empty and evenly divisible by 8 bytes (Float64)
          if (buf.byteLength === 0 || buf.byteLength % 8 !== 0) {
            logger.warn(
              `[AlbumReplayGainJob] Corrupt or unaligned loudness block cache for song ${rg.songId} (${buf.byteLength} bytes). Deferring album aggregation.`
            );
            return;
          }

          const numBlocks = buf.byteLength / 8;
          const blockEnergies = new Float64Array(numBlocks);
          const dataView = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          for (let i = 0; i < numBlocks; i++) {
            blockEnergies[i] = dataView.getFloat64(i * 8, true); // little-endian
          }

          tracksData.push({
            songId: rg.songId,
            blockEnergies,
            samplePeak: rg.trackPeak ?? 0.0
          });
        } catch (err) {
          logger.warn(
            `[AlbumReplayGainJob] Missing loudness block cache for song ${rg.songId}, skipping album aggregation for now.`,
            { err }
          );
          return;
        }
      }

      if (this.isCancelled()) return;

      // 5. Aggregate album loudness using pure ITU-R BS.1770-4 pooled gating (Constraints #4, #5)
      const albumResult = AlbumLoudnessAggregator.aggregate(tracksData);

      // Snapshot validation timestamp to guard against stale album updates (Constraint #6)
      const snapshotMap = new Map(rgRows.map((r) => [r.songId, r.updatedAt.getTime()]));
      let committed = false;
      try {
        await db.transaction(async (trx) => {
          if (this.isCancelled()) {
            return;
          }

          // Re-query inside transaction and verify exact row count and presence
          const currentRows = await trx.query.replayGain.findMany({
            where: inArray(replayGain.songId, songIds)
          });

          if (currentRows.length !== songIds.length) {
            logger.warn(
              `[AlbumReplayGainJob] Aborting commit for album ${this.albumId}: row count mismatch (expected ${songIds.length}, found ${currentRows.length}).`
            );
            return;
          }

          // Verify every song is still present and matches the snapshot timestamp
          for (const cur of currentRows) {
            const originalTime = snapshotMap.get(cur.songId);
            if (originalTime === undefined || cur.updatedAt.getTime() !== originalTime) {
              logger.warn(
                `[AlbumReplayGainJob] Stale aggregation detected for album ${this.albumId} (song ${cur.songId} changed). Aborting commit.`
              );
              return;
            }
          }

          // Execute truly atomic conditional updates per row
          const now = new Date();
          for (const rg of rgRows) {
            const expectedUpdatedAt = rg.updatedAt;
            const updateResult = await trx
              .update(replayGain)
              .set({
                albumGain: albumResult.albumGain,
                albumPeak: albumResult.albumPeak,
                generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
                updatedAt: now
              })
              .where(
                and(
                  eq(replayGain.songId, rg.songId),
                  eq(replayGain.updatedAt, expectedUpdatedAt)
                )
              )
              .returning({ id: replayGain.id });

            if (!updateResult || updateResult.length === 0) {
              logger.warn(
                `[AlbumReplayGainJob] Atomic update condition failed for song ${rg.songId} in album ${this.albumId}. Concurrent write occurred.`
              );
              throw new Error(`Optimistic concurrency conflict on song ${rg.songId}`);
            }
          }

          committed = true;
        });
      } catch (trxErr) {
        logger.warn(`[AlbumReplayGainJob] Transaction rolled back for album ${this.albumId}:`, { trxErr });
        // Re-throw so the outer catch propagates to JobScheduler for backoff/retry.
        // Previously this was swallowed (committed = false; return;), silently marking
        // the job as completed and preventing retry on SQLITE_BUSY or concurrency conflicts.
        throw trxErr;
      }

      if (!committed) {
        // Cancelled or aborted without error (stale snapshot, row count mismatch).
        // Return silently — not a retriable failure, just a no-op.
        return;
      }

      // 6. Post-commit event emission
      this.scheduler.emit(ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED, {
        albumId: this.albumId,
        albumGain: albumResult.albumGain,
        albumPeak: albumResult.albumPeak,
        songCount: songIds.length
      });

      logger.info(
        `[AlbumReplayGainJob] Successfully aggregated loudness for album ${this.albumId}: gain=${albumResult.albumGain}dB, peak=${albumResult.albumPeak} (${songIds.length} tracks)`
      );
    } catch (error) {
      logger.error(`[AlbumReplayGainJob] Failed to aggregate loudness for album ${this.albumId}`, {
        error
      });
      throw error;
    }
  }
}
