import type { TagWriterService } from '../services/TagWriterService';
import type { LibraryRelationalSyncService } from './LibraryRelationalSyncService';

export interface ExecuteMutationOptions {
  songId: number;
  filePath: string;
  tagPayload: Record<string, string | number | Buffer>;
  fieldMap: Record<string, string | number>;
}

export interface MutationExecutionResult {
  success: boolean;
  error?: string;
  warning?: string;
}

export class MutationExecutor {
  private readonly tagWriter: TagWriterService;
  private readonly relationalSync: LibraryRelationalSyncService;

  constructor(tagWriter: TagWriterService, relationalSync: LibraryRelationalSyncService) {
    this.tagWriter = tagWriter;
    this.relationalSync = relationalSync;
  }

  public async executeSingleMutation(options: ExecuteMutationOptions): Promise<MutationExecutionResult> {
    try {
      // Single persistence owner: updateSongId3Tags (called via relationalSync.dbUpdater)
      // handles BOTH disk writes (ID3 tags) and database relational sync.
      // TagWriterService is intentionally NOT used here to avoid double disk writes.
      const syncResult = await this.relationalSync.syncRelationalDatabase(
        options.songId,
        options.filePath,
        options.fieldMap
      );

      return {
        success: syncResult.success,
        warning: syncResult.warning,
        error: syncResult.success ? undefined : syncResult.warning ?? 'Relational database sync failed'
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
