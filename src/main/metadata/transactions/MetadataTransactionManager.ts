import type { MetadataTransaction, ResourceMutationPayload, TransactionState } from '../domain/MetadataTransaction';
import type { UndoToken } from '../domain/UndoToken';
import { TagWriterService } from '../services/TagWriterService';
import { LibraryRelationalSyncService, type SongDbUpdater } from './LibraryRelationalSyncService';
import { ArtworkDownloaderService } from './ArtworkDownloaderService';
import { ArtworkCacheInvalidator } from './ArtworkCacheInvalidator';
import { MetadataHistoryService } from '../history/MetadataHistoryService';

export interface TransactionExecutionOptions {
  replaceArtwork?: boolean;
  artworkUrl?: string;
  songArtworksPath?: string;
  albumArtworksPath?: string;
}

export interface TransactionResult {
  success: boolean;
  updatedCount: number;
  failedCount: number;
  errors: string[];
  undoToken?: UndoToken;
}

export class MetadataTransactionManager {
  private readonly tagWriter: TagWriterService;
  private readonly relationalSync: LibraryRelationalSyncService;
  private readonly artworkDownloader: ArtworkDownloaderService;
  private readonly cacheInvalidator: ArtworkCacheInvalidator;
  private readonly historyService: MetadataHistoryService;

  constructor(options?: {
    tagWriter?: TagWriterService;
    dbUpdater?: SongDbUpdater;
    historyService?: MetadataHistoryService;
  }) {
    this.tagWriter = options?.tagWriter ?? new TagWriterService();
    this.relationalSync = new LibraryRelationalSyncService(options?.dbUpdater);
    this.artworkDownloader = new ArtworkDownloaderService();
    this.cacheInvalidator = new ArtworkCacheInvalidator();
    this.historyService = options?.historyService ?? new MetadataHistoryService();
  }

  public async executeTransaction(
    operationId: string,
    mutations: ResourceMutationPayload[],
    options?: TransactionExecutionOptions
  ): Promise<TransactionResult> {
    if (!mutations || mutations.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    let artworkBuffer: Buffer | undefined;
    if (options?.replaceArtwork && options.artworkUrl) {
      const buffer = await this.artworkDownloader.fetchAndValidateArtwork(options.artworkUrl);
      if (buffer) {
        artworkBuffer = buffer;
      }
    }

    const undoToken: UndoToken = {
      id: `undo-${Date.now()}`,
      operationId,
      timestamp: Date.now(),
      description: `Metadata transaction for operation ${operationId}`,
      affectedResourceIds: mutations.map((m) => m.resourceId)
    };

    const transaction: MetadataTransaction = {
      id: `tx-${Date.now()}`,
      operationId,
      createdAt: Date.now(),
      state: 'executing',
      mutations,
      undoToken
    };

    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const mut of mutations) {
      if (!mut.filePath) {
        failedCount++;
        errors.push(`Resource ${mut.resourceId} missing file path`);
        continue;
      }

      const tagPayload: Record<string, string | number | Buffer> = {};
      const fieldMap: Record<string, string | number> = {};

      for (const fm of mut.fieldMutations) {
        if (fm.newValue !== undefined) {
          tagPayload[fm.fieldId] = fm.newValue;
          fieldMap[fm.fieldId] = fm.newValue;
        }
      }

      if (artworkBuffer) {
        tagPayload.artworkBuffer = artworkBuffer;
      }

      try {
        const writeResults = await this.tagWriter.writeBatch([
          { filePath: mut.filePath, tags: tagPayload }
        ]);

        if (writeResults[0]?.success) {
          await this.relationalSync.syncRelationalDatabase(
            Number(mut.resourceId),
            mut.filePath,
            fieldMap
          );
          updatedCount++;
        } else {
          failedCount++;
          errors.push(writeResults[0]?.error ?? `Failed to write tags to ${mut.filePath}`);
        }
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
      }
    }

    if (artworkBuffer) {
      this.cacheInvalidator.invalidateArtworkCache(
        options?.songArtworksPath,
        options?.albumArtworksPath
      );
    }

    transaction.state = errors.length === 0 ? 'committed' : 'failed';

    return {
      success: errors.length === 0,
      updatedCount,
      failedCount,
      errors,
      undoToken
    };
  }

  public get history(): MetadataHistoryService {
    return this.historyService;
  }
}
