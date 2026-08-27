import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@main/db/db';
import { albumsSongs, replayGain } from '@main/db/schema';
import logger from '@main/logger';
import {
  AlbumLoudnessAggregator,
  type TrackLoudnessData
} from '../process/audio/AlbumLoudnessAggregator';
import { ASSET_EVENTS } from '../libraryChoreography';
import type { Job, JobClass, JobState } from '../types';
import { CURRENT_REPLAYGAIN_GENERATOR_VERSION } from './replayGainJob';

export class AlbumReplayGainJob implements Job {
  id: string;
  type = 'album_replaygain';
  state: JobState = 'queued';
  jobClass: JobClass;
  retries = 0;
  maxRetries = 2;
  description: string;

  public albumId: number;
  private eventBus: EventEmitter;

  constructor(
    albumId: number,
    eventBus: EventEmitter,
    jobClass: JobClass = 'background'
  ) {
    this.albumId = albumId;
    this.eventBus = eventBus;
    this.id = `album_replaygain_${albumId}`;
    this.jobClass = jobClass;
    this.description = `Aggregating album loudness for album ${albumId}`;
  }

  async execute(): Promise<void> {
    try {
      if (this.state === 'cancelled') return;

      // 1. Fetch all songs associated with this album
      const albumSongRows = await db.query.albumsSongs.findMany({
        where: (as, { eq: eq_ }) => eq_(as.albumId, this.albumId)
      });

      if (albumSongRows.length === 0) {
        logger.debug(`[AlbumReplayGainJob] No songs found for album ${this.albumId}, skipping.`);
        return;
      }

      const songIds = albumSongRows.map((row) => row.songId);

      // 2. Fetch all replay_gain records for these songs
      const rgRows = await db.query.replayGain.findMany({
        where: (rg, { inArray: inArray_ }) => inArray_(rg.songId, songIds)
      });

      // Completeness check: All songs in the album must have finished track ReplayGain analysis
      if (rgRows.length < songIds.length) {
        logger.debug(
          `[AlbumReplayGainJob] Incomplete album ${this.albumId} (${rgRows.length}/${songIds.length} tracks analyzed). Deferring aggregation.`
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

      if (this.state === 'cancelled') return;

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
          // 64-bit IEEE 754 Float64Array (8 bytes per block)
          const blockEnergies = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);

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

      if (this.state === 'cancelled') return;

      // 5. Aggregate album loudness using pure ITU-R BS.1770-4 pooled gating (Constraints #4, #5)
      const albumResult = AlbumLoudnessAggregator.aggregate(tracksData);

      // Snapshot validation timestamp to guard against stale album updates (Constraint #6)
      const snapshotSongIds = new Set(rgRows.map((r) => r.songId));
      const snapshotMap = new Map(rgRows.map((r) => [r.songId, r.updatedAt.getTime()]));

      let committed = false;
      await db.transaction(async (trx) => {
        // Re-verify current DB state hasn't changed during aggregation
        const currentRows = await trx.query.replayGain.findMany({
          where: inArray(replayGain.songId, songIds)
        });

        for (const cur of currentRows) {
          const originalTime = snapshotMap.get(cur.songId);
          if (originalTime === undefined || cur.updatedAt.getTime() !== originalTime) {
            logger.warn(
              `[AlbumReplayGainJob] Stale aggregation detected for album ${this.albumId} (song ${cur.songId} changed). Aborting commit.`
            );
            return;
          }
        }

        const now = new Date();
        await trx
          .update(replayGain)
          .set({
            albumGain: albumResult.albumGain,
            albumPeak: albumResult.albumPeak,
            generatorVersion: CURRENT_REPLAYGAIN_GENERATOR_VERSION,
            updatedAt: now
          })
          .where(inArray(replayGain.songId, songIds));

        committed = true;
      });

      if (!committed) {
        return;
      }

      // 7. Post-commit event emission
      this.eventBus.emit(ASSET_EVENTS.ALBUM_REPLAYGAIN_UPDATED, {
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
