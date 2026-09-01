import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistLink } from '../models/PlaylistLink';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { SyncOperation } from '../models/SyncOperation';

export class PlaylistSyncPlanner {
  createSyncPlan(
    link: PlaylistLink,
    targetImportPlan: PlaylistImportPlan,
    currentPlaylistSongIds: number[]
  ): PlaylistSyncPlan {
    const operations: SyncOperation[] = [];

    // Extract planned song IDs to import from target import plan
    const targetSongIds: number[] = [];
    for (const entry of targetImportPlan.entries) {
      if (
        entry.decision === 'IMPORT' &&
        entry.source.trackReference.libraryMatch.matchedSongId !== undefined
      ) {
        targetSongIds.push(entry.source.trackReference.libraryMatch.matchedSongId);
      }
    }

    const currentSet = new Set(currentPlaylistSongIds);
    const targetSet = new Set(targetSongIds);

    let additionsCount = 0;
    let removalsCount = 0;

    // Detect additions (in target plan but missing from current Nora playlist)
    for (const songId of targetSongIds) {
      if (!currentSet.has(songId)) {
        operations.push({
          type: 'ADD_SONG',
          songId,
          reason: 'Song present in updated source playlist'
        });
        additionsCount++;
      }
    }

    // Detect removals if policy is ONE_WAY_SOURCE_WINS (in current Nora playlist but absent from target source)
    if (link.syncPolicy === 'ONE_WAY_SOURCE_WINS') {
      for (const songId of currentPlaylistSongIds) {
        if (!targetSet.has(songId)) {
          operations.push({
            type: 'REMOVE_SONG',
            songId,
            reason: 'Song removed from source playlist'
          });
          removalsCount++;
        }
      }
    }

    const hasChanges = operations.length > 0;

    return {
      linkId: link.id,
      playlistId: link.playlistId,
      sourceFile: link.sourceFile,
      syncPolicy: link.syncPolicy,
      operations,
      hasChanges,
      additionsCount,
      removalsCount
    };
  }
}
