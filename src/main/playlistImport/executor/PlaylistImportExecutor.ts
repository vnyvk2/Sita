import type { PlaylistPersistence } from '../interfaces/PlaylistPersistence';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportExecutionResult } from '../models/PlaylistImportExecutionResult';
import type { PlaylistImportExecutionStatistics } from '../models/PlaylistImportExecutionStatistics';

export class PlaylistImportExecutor {
  constructor(private persistence: PlaylistPersistence) {}

  async execute(plan: PlaylistImportPlan): Promise<PlaylistImportExecutionResult> {
    const startTime = Date.now();

    // Extract matched song IDs from plan entries where decision is IMPORT, preserving order
    const songIdsToImport: number[] = [];
    for (const entry of plan.entries) {
      if (entry.decision === 'IMPORT' && entry.source.trackReference.libraryMatch.matchedSongId !== undefined) {
        songIdsToImport.push(entry.source.trackReference.libraryMatch.matchedSongId);
      }
    }

    let createdPlaylistId = 0;

    // Execute playlist creation & song insertion atomically in a single transaction
    await this.persistence.runInTransaction(async () => {
      createdPlaylistId = await this.persistence.createPlaylist(plan.playlistName, plan.description);

      if (songIdsToImport.length > 0) {
        await this.persistence.addEntries(createdPlaylistId, songIdsToImport);
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
