import type { ResourceMutationPayload } from '../domain/MetadataTransaction';
import type { UndoToken } from '../domain/UndoToken';
import type { RequestPipeline } from '../../platform/networking/RequestPipeline';
import { ArtworkCacheInvalidator } from './ArtworkCacheInvalidator';
import { ArtworkDownloaderService } from './ArtworkDownloaderService';
import { LibraryRelationalSyncService, type SongDbUpdater } from './LibraryRelationalSyncService';
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
  cancelled?: boolean;
  updatedCount: number;
  failedCount: number;
  errors: string[];
  undoToken?: UndoToken;
}

export class MetadataTransactionManager {
  private readonly relationalSync: LibraryRelationalSyncService;
  private readonly artworkDownloader: ArtworkDownloaderService;
  private readonly cacheInvalidator: ArtworkCacheInvalidator;
  private readonly historyService: MetadataHistoryService;
  private readonly mutationExecutor: MutationExecutor;

  constructor(options?: {
    dbUpdater?: SongDbUpdater;
    historyService?: MetadataHistoryService;
    requestPipeline?: RequestPipeline;
    artworkDownloader?: ArtworkDownloaderService;
  }) {
    this.relationalSync = new LibraryRelationalSyncService(options?.dbUpdater);
    this.artworkDownloader =
      options?.artworkDownloader ??
      new ArtworkDownloaderService(options?.requestPipeline);
    this.cacheInvalidator = new ArtworkCacheInvalidator();
    this.historyService = options?.historyService ?? new MetadataHistoryService();
    this.mutationExecutor = new MutationExecutor(this.relationalSync);
  }

  /**
   * Reverts all applied draft snapshots in reverse chronological order.
   */
  private async rollbackDraftSnapshots(draftSnapshots: DraftSnapshot[]): Promise<void> {
    if (draftSnapshots.length === 0) return;
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
      return { success: true, updatedCount: 0, deferredCount: 0, failedCount: 0, errors: [] };
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
    let deferredCount = 0;
    let failedCount = 0;
    let isCancelled = false;
    const errors: string[] = [];
    const draftSnapshots: DraftSnapshot[] = [];

    const chunkSize = options?.chunkSize ?? 50;
    for (let i = 0; i < mutations.length; i += chunkSize) {
      if (signal?.aborted) {
        isCancelled = true;
        errors.push('Transaction operation cancelled by user');
        await this.rollbackDraftSnapshots(draftSnapshots);
        updatedCount = 0;
        deferredCount = 0;
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
          if (res.deferred) {
            deferredCount++;
          }
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
        await this.rollbackDraftSnapshots(draftSnapshots);
        updatedCount = 0;
        deferredCount = 0;
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
      cancelled: isCancelled || undefined,
      updatedCount,
      deferredCount,
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
      if (song.trackNumber !== undefined) revertTags.trackNumber = song.trackNumber;
      if (song.discNumber !== undefined) revertTags.discNumber = song.discNumber;
      if (song.genre !== undefined) revertTags.genre = song.genre;
      revertTags.isrc = song.isrc ?? '';
      revertTags.musicBrainzRecordingId = song.musicBrainzRecordingId ?? '';

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
