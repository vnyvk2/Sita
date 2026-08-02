import type { PlaylistPersistence, PlaylistEntryWriteModel } from '../interfaces/PlaylistPersistence';
import type { TransactionRunner } from '../interfaces/TransactionRunner';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportExecutionStatistics } from '../models/PlaylistImportExecutionStatistics';
import logger from '../../logger';

export class PlaylistImportExecutor {
  constructor(
    private persistence: PlaylistPersistence,
    private transactionRunner: TransactionRunner
  ) {}

  async execute(plan: PlaylistImportPlan, options?: { targetPlaylistId?: number; mode?: 'create' | 'merge' | 'replace' }): Promise<PlaylistImportExecutionResult> {
    const startTime = Date.now();
    logger.info(`PlaylistImportExecutor: starting execution for '${plan.playlistName}'...`);

    // Extract rich write model entries for persistence where decision is IMPORT, preserving order
    const entriesToImport: PlaylistEntryWriteModel[] = [];
    const songIdsToImport: number[] = [];

    for (const planEntry of plan.entries) {
      if (
        planEntry.decision === 'IMPORT' &&
        planEntry.source.trackReference.libraryMatch.matchedSongId !== undefined
      ) {
        const songId = planEntry.source.trackReference.libraryMatch.matchedSongId;
        songIdsToImport.push(songId);

        entriesToImport.push({
          songId,
          position: planEntry.source.position,
          dateAdded: planEntry.source.dateAdded,
          comments: planEntry.source.comments
        });
      }
    }

    logger.info(
      JSON.stringify({
        stage: 'EXECUTOR',
        entriesQueued: entriesToImport.length
      })
    );

    const mode = options?.mode || (options?.targetPlaylistId ? 'merge' : 'create');
    let playlistId = mode === 'create' ? 0 : options?.targetPlaylistId || 0;

    // Execute playlist creation & song insertion via TransactionRunner
    await this.transactionRunner.runInTransaction(async () => {
      if (!playlistId) {
        logger.info(`PlaylistImportExecutor: creating playlist '${plan.playlistName}' via persistence...`);
        playlistId = await this.persistence.createPlaylist(plan.playlistName, plan.description);
        logger.info(`PlaylistImportExecutor: playlist created with ID ${playlistId}.`);
      } else {
        logger.info(`PlaylistImportExecutor: using existing target playlist ID ${playlistId} with mode ${mode}...`);
        if (mode === 'replace' && this.persistence.clearEntries) {
          await this.persistence.clearEntries(playlistId);
          logger.info(`PlaylistImportExecutor: cleared existing entries for playlist ${playlistId}.`);
        }
      }

      if (entriesToImport.length > 0) {
        logger.info(`PlaylistImportExecutor: adding ${entriesToImport.length} entries to playlist ${playlistId} in chunked batches...`);
        const CHUNK_SIZE = 500;
        for (let i = 0; i < entriesToImport.length; i += CHUNK_SIZE) {
          const chunk = entriesToImport.slice(i, i + CHUNK_SIZE);
          await this.persistence.addEntries(playlistId, chunk);
        }
        logger.info(`PlaylistImportExecutor: entries added successfully.`);
      }
    });

    const durationMs = Date.now() - startTime;
    logger.info(`PlaylistImportExecutor: execution finished successfully in ${durationMs}ms.`);

    const statistics: PlaylistImportExecutionStatistics = {
      totalPlannedEntries: plan.entries.length,
      importedEntriesCount: songIdsToImport.length,
      skippedEntriesCount: plan.entries.length - songIdsToImport.length,
      durationMs
    };

    return {
      playlistId: playlistId,
      playlistName: plan.playlistName,
      success: true,
      importedSongIds: songIdsToImport,
      statistics,
      warnings: plan.warnings
    };
  }
}
