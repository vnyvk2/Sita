import type { PlaylistPersistence, PlaylistEntryWriteModel } from '../interfaces/PlaylistPersistence';
import type { TransactionRunner } from '../interfaces/TransactionRunner';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportExecutionStatistics } from '../models/PlaylistImportExecutionStatistics';

export class PlaylistImportExecutor {
  constructor(
    private persistence: PlaylistPersistence,
    private transactionRunner: TransactionRunner
  ) {}

  async execute(plan: PlaylistImportPlan): Promise<PlaylistImportExecutionResult> {
    const startTime = Date.now();

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

    let createdPlaylistId = 0;

    // Execute playlist creation & song insertion atomically via TransactionRunner
    await this.transactionRunner.runInTransaction(async () => {
      createdPlaylistId = await this.persistence.createPlaylist(plan.playlistName, plan.description);

      if (entriesToImport.length > 0) {
        await this.persistence.addEntries(createdPlaylistId, entriesToImport);
      }
    });

    const durationMs = Date.now() - startTime;
    const statistics: PlaylistImportExecutionStatistics = {
      totalPlannedEntries: plan.entries.length,
      importedEntriesCount: songIdsToImport.length,
      skippedEntriesCount: plan.entries.length - songIdsToImport.length,
      durationMs
    };

    return {
      playlistId: createdPlaylistId,
      playlistName: plan.playlistName,
      success: true,
      importedSongIds: songIdsToImport,
      statistics,
      warnings: plan.warnings
    };
  }
}
