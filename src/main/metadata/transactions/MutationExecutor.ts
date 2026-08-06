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
      const writeResults = await this.tagWriter.writeBatch([
        { filePath: options.filePath, tags: options.tagPayload }
      ]);

      if (!writeResults[0]?.success) {
        return {
          success: false,
          error: writeResults[0]?.error ?? `Failed to write tags to ${options.filePath}`
        };
      }

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
