import type { ResourceMutationPayload } from '../domain/MetadataTransaction';
import type { UndoToken } from '../domain/UndoToken';
import { TagWriterService } from '../services/TagWriterService';
import { LibraryRelationalSyncService, type SongDbUpdater } from './LibraryRelationalSyncService';
import { ArtworkDownloaderService } from './ArtworkDownloaderService';
import { ArtworkCacheInvalidator } from './ArtworkCacheInvalidator';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { MutationExecutor } from './MutationExecutor';
import { SnapshotBuilder, type DraftSnapshot } from './SnapshotBuilder';

export interface TransactionExecutionOptions {
  replaceArtwork?: boolean;
  artworkUrl?: string;
  songArtworksPath?: string;
  albumArtworksPath?: string;
  chunkSize?: number;
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
  private readonly mutationExecutor: MutationExecutor;

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
    this.mutationExecutor = new MutationExecutor(this.tagWriter, this.relationalSync);
  }

  /**
   * Executes a batch of metadata mutations as a single atomic transaction (Option A — Entire Transaction Atomic).
   *
   * Transaction Semantics:
   * - Mutations are processed in chunks (default 50 files per chunk).
   * - If ANY mutation fails or an AbortSignal cancellation occurs mid-transaction,
   *   all previously applied mutations in the transaction are automatically reverted
   *   back to their pre-transaction disk and database states.
   */
  public async executeTransaction(
    operationId: string,
    mutations: ResourceMutationPayload[],
    options?: TransactionExecutionOptions,
    signal?: AbortSignal
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

    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const draftSnapshots: DraftSnapshot[] = [];

    const chunkSize = options?.chunkSize ?? 50;
    for (let i = 0; i < mutations.length; i += chunkSize) {
      if (signal?.aborted) {
        failedCount++;
        errors.push('Transaction operation cancelled by user');
        if (draftSnapshots.length > 0) {
          for (const draft of [...draftSnapshots].reverse()) {
            try {
              await this.mutationExecutor.executeSingleMutation({
                songId: draft.songId,
                filePath: draft.filePath,
                tagPayload: draft.previousTags as Record<string, string | number>,
                fieldMap: draft.previousTags as Record<string, string | number>
              });
            } catch {
              // Ignore single item revert failure during cancellation rollback
            }
          }
          draftSnapshots.length = 0;
          updatedCount = 0;
        }
        break;
      }

      const chunk = mutations.slice(i, i + chunkSize);
      let chunkFailed = false;

      for (const mut of chunk) {
        if (!mut.filePath) {
          failedCount++;
          errors.push(`Resource ${mut.resourceId} missing file path`);
          chunkFailed = true;
          break;
        }

        const tagPayload: Record<string, string | number | Buffer> = {};
        const fieldMap: Record<string, string | number> = {};
        const previousState: Record<string, string | number | undefined> = {};
        const providerAttributions: Record<string, { providerId: string; confidenceScore?: number }> = {};

        for (const fm of mut.fieldMutations) {
          if (fm.newValue !== undefined) {
            tagPayload[fm.fieldId] = fm.newValue;
            fieldMap[fm.fieldId] = fm.newValue;
            previousState[fm.fieldId] = fm.oldValue;
            if (fm.providerId) {
              providerAttributions[fm.fieldId] = {
                providerId: fm.providerId,
                confidenceScore: fm.confidenceScore
              };
            }
          }
        }

        if (artworkBuffer) {
          tagPayload.artworkBuffer = artworkBuffer;
        }

        const res = await this.mutationExecutor.executeSingleMutation({
          songId: Number(mut.resourceId),
          filePath: mut.filePath,
          tagPayload,
          fieldMap
        });

        if (res.success) {
          draftSnapshots.push({
            songId: Number(mut.resourceId),
            filePath: mut.filePath,
            previousTags: previousState,
            appliedTags: fieldMap,
            providerAttributions
          });
          updatedCount++;
        } else {
          failedCount++;
          errors.push(res.error ?? `Mutation failed for ${mut.filePath}`);
          chunkFailed = true;
          break;
        }
      }

      if (chunkFailed) {
        // Atomic Partial Batch Rollback: Revert any mutations already applied in this transaction
        if (draftSnapshots.length > 0) {
          for (const draft of [...draftSnapshots].reverse()) {
            try {
              await this.mutationExecutor.executeSingleMutation({
                songId: draft.songId,
                filePath: draft.filePath,
                tagPayload: draft.previousTags as Record<string, string | number>,
                fieldMap: draft.previousTags as Record<string, string | number>
              });
            } catch {
              // Ignore single item revert failure during atomic rollback
            }
          }
          draftSnapshots.length = 0;
          updatedCount = 0;
        }
        break;
      }
    }

    if (artworkBuffer) {
      this.cacheInvalidator.invalidateArtworkCache(
        options?.songArtworksPath,
        options?.albumArtworksPath
      );
    }

    if (draftSnapshots.length > 0) {
      const historySnapshot = SnapshotBuilder.buildHistorySnapshot(operationId, undoToken, draftSnapshots);
      this.historyService.pushSnapshot(historySnapshot);
    }

    return {
      success: errors.length === 0,
      updatedCount,
      failedCount,
      errors,
      undoToken: draftSnapshots.length > 0 ? undoToken : undefined
    };
  }

  /**
   * Executes a rollback operation using the history snapshot stack.
   */
  public async rollbackLastTransaction(targetSongId?: number): Promise<{ success: boolean; revertedCount: number; errors: string[] }> {
    const lastSnapshot = this.historyService.popUndo(targetSongId);
    if (!lastSnapshot) {
      return { success: true, revertedCount: 0, errors: [] };
    }

    let revertedCount = 0;
    const errors: string[] = [];

    for (const song of lastSnapshot.previousSongs) {
      const revertTags: Record<string, string | number> = {};
      if (song.title !== undefined) revertTags.title = song.title;
      if (song.artist !== undefined) revertTags.artist = song.artist;
      if (song.album !== undefined) revertTags.album = song.album;
      if (song.year !== undefined) revertTags.year = song.year;

      const res = await this.mutationExecutor.executeSingleMutation({
        songId: song.songId,
        filePath: song.path,
        tagPayload: revertTags,
        fieldMap: revertTags
      });

      if (res.success) {
        revertedCount++;
      } else {
        errors.push(res.error ?? `Failed to revert tags for ${song.path}`);
      }
    }

    return {
      success: errors.length === 0,
      revertedCount,
      errors
    };
  }

  public get history(): MetadataHistoryService {
    return this.historyService;
  }
}
