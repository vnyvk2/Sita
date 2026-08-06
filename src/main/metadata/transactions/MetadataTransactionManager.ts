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

    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const draftSnapshots: DraftSnapshot[] = [];

    for (const mut of mutations) {
      if (!mut.filePath) {
        failedCount++;
        errors.push(`Resource ${mut.resourceId} missing file path`);
        continue;
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
