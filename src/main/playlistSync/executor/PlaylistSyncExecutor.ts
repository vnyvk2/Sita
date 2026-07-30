import type { PlaylistPersistence, PlaylistEntryWriteModel } from '../../playlistImport/interfaces/PlaylistPersistence';
import type { TransactionRunner } from '../../playlistImport/interfaces/TransactionRunner';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';

export interface SyncExecutionResult {
  playlistId: number;
  success: boolean;
  appliedAdditionsCount: number;
  appliedRemovalsCount: number;
  durationMs: number;
}

export class PlaylistSyncExecutor {
  constructor(
    private persistence: PlaylistPersistence,
    private transactionRunner: TransactionRunner
  ) {}

  async executeSync(plan: PlaylistSyncPlan): Promise<SyncExecutionResult> {
    const startTime = Date.now();

    const songsToAdd: PlaylistEntryWriteModel[] = [];
    let appliedAdditionsCount = 0;
    let appliedRemovalsCount = 0;

    for (const op of plan.operations) {
      if (op.type === 'ADD_SONG' && op.songId !== undefined) {
        songsToAdd.push({ songId: op.songId, position: op.position ?? songsToAdd.length + 1 });
        appliedAdditionsCount++;
      } else if (op.type === 'REMOVE_SONG') {
        appliedRemovalsCount++;
      }
    }

    await this.transactionRunner.runInTransaction(async () => {
      if (songsToAdd.length > 0) {
        await this.persistence.addEntries(plan.playlistId, songsToAdd);
      }
    });

    const durationMs = Date.now() - startTime;
    return {
      playlistId: plan.playlistId,
      success: true,
      appliedAdditionsCount,
      appliedRemovalsCount,
      durationMs
    };
  }
}
