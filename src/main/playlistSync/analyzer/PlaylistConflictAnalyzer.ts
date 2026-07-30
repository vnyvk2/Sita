import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { PlaylistConflict } from '../models/PlaylistConflict';
import type { ConflictAnalysis } from '../models/ConflictAnalysis';

export class PlaylistConflictAnalyzer {
  analyzePlan(plan: PlaylistSyncPlan, currentPlaylistSongIds: number[]): ConflictAnalysis {
    const conflicts: PlaylistConflict[] = [];

    const songAddCounts = new Map<number, number>();
    for (const op of plan.operations) {
      if (op.type === 'ADD_SONG' && op.songId !== undefined) {
        songAddCounts.set(op.songId, (songAddCounts.get(op.songId) ?? 0) + 1);
      }
    }

    // 1. Detect duplicate entry additions
    for (const [songId, count] of songAddCounts.entries()) {
      if (count > 1) {
        conflicts.push({
          id: `conflict_dup_${songId}`,
          type: 'DUPLICATE_ENTRY',
          severity: 'MEDIUM',
          songId,
          reason: `Song ID ${songId} is specified ${count} times in target source playlist`,
          suggestedResolution: 'Deduplicate additions',
          requiresUserDecision: false
        });
      }
    }

    // 2. Detect local modifications / removal conflicts
    const removals = plan.operations.filter((op) => op.type === 'REMOVE_SONG');
    if (removals.length > 0 && plan.syncPolicy === 'KEEP_LOCAL_CHANGES') {
      for (const op of removals) {
        conflicts.push({
          id: `conflict_rem_${op.songId}`,
          type: 'LOCAL_MODIFIED',
          severity: 'HIGH',
          songId: op.songId,
          reason: `Song ID ${op.songId} absent from source but retained under KEEP_LOCAL_CHANGES policy`,
          suggestedResolution: 'Keep local song',
          requiresUserDecision: true
        });
      }
    }

    const hasConflicts = conflicts.length > 0;
    const hasManualConflicts = conflicts.some((c) => c.requiresUserDecision);

    return {
      conflicts,
      hasConflicts,
      hasManualConflicts
    };
  }
}
