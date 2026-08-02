import type { PlaylistEntryWriteModel } from '../../playlistImport/interfaces/PlaylistPersistence';
import type { TransactionRunner } from '../../playlistImport/interfaces/TransactionRunner';
import type { PlaylistSyncPersistence } from '../interfaces/PlaylistSyncPersistence';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';

export interface SyncExecutionResult {
  playlistId: number;
  success: boolean;
  appliedAdditionsCount: number;
  appliedRemovalsCount: number;
  appliedMovesCount: number;
  durationMs: number;
}

export class PlaylistSyncExecutor {
  constructor(
    private syncPersistence: PlaylistSyncPersistence,
    private transactionRunner: TransactionRunner
  ) {}

  async executeSync(plan: PlaylistSyncPlan): Promise<SyncExecutionResult> {
    const startTime = Date.now();

    const songsToAdd: PlaylistEntryWriteModel[] = [];
    const songIdsToRemove: number[] = [];
    let appliedAdditionsCount = 0;
    let appliedRemovalsCount = 0;
    let appliedMovesCount = 0;

    for (const op of plan.operations) {
      if (op.type === 'ADD_SONG' && op.songId !== undefined) {
        songsToAdd.push({ songId: op.songId, position: op.position ?? songsToAdd.length + 1 });
        appliedAdditionsCount++;
      } else if (op.type === 'REMOVE_SONG' && op.songId !== undefined) {
        songIdsToRemove.push(op.songId);
        appliedRemovalsCount++;
      } else if (op.type === 'MOVE_SONG') {
        appliedMovesCount++;
      }
    }

    await this.transactionRunner.runInTransaction(async () => {
      if (songIdsToRemove.length > 0) {
        await this.syncPersistence.removeEntries(plan.playlistId, songIdsToRemove);
      }

      if (songsToAdd.length > 0) {
        await this.syncPersistence.addEntries(plan.playlistId, songsToAdd);
      }
    });

    const durationMs = Date.now() - startTime;
    return {
      playlistId: plan.playlistId,
      success: true,
      appliedAdditionsCount,
      appliedRemovalsCount,
      appliedMovesCount,
      durationMs
    };
  }
}
