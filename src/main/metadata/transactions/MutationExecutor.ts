import type { LibraryRelationalSyncService } from './LibraryRelationalSyncService';

export interface ExecuteMutationOptions {
  songId: number;
  filePath: string;
  tagPayload: Record<string, string | number | Buffer>;
  fieldMap: Record<string, string | number>;
}

export interface MutationExecutionResult {
  success: boolean;
  deferred?: boolean;
  error?: string;
  warning?: string;
}

/**
 * MutationExecutor — executes a single metadata mutation for one song.
 *
 * Persistence owner: updateSongId3Tags (called via LibraryRelationalSyncService.dbUpdater) handles
 * BOTH disk writes (ID3 tags) and database relational sync.
 *
 * TagWriterService was intentionally removed from this path to establish a single persistence owner
 * and avoid double disk writes.
 */
export class MutationExecutor {
  private readonly relationalSync: LibraryRelationalSyncService;

  constructor(relationalSync: LibraryRelationalSyncService) {
    this.relationalSync = relationalSync;
  }

  public async executeSingleMutation(
    options: ExecuteMutationOptions
  ): Promise<MutationExecutionResult> {
    try {
      const syncResult = await this.relationalSync.syncRelationalDatabase(
        options.songId,
        options.filePath,
        options.fieldMap,
        options.tagPayload
      );

      return {
        success: syncResult.success,
        deferred: syncResult.deferred,
        warning: syncResult.warning,
        error: syncResult.success
          ? undefined
          : (syncResult.warning ?? 'Relational database sync failed')
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
