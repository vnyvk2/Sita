import type { MetadataTransaction, ResourceMutationPayload, TransactionState } from '../domain/MetadataTransaction';
import type { UndoToken } from '../domain/UndoToken';
import { TagWriterService } from '../services/TagWriterService';
import { LibraryRelationalSyncService, type SongDbUpdater } from './LibraryRelationalSyncService';
import { ArtworkDownloaderService } from './ArtworkDownloaderService';
import { ArtworkCacheInvalidator } from './ArtworkCacheInvalidator';
import { MetadataHistoryService, type MetadataHistorySnapshot, type SongMetadataSnapshot } from '../history/MetadataHistoryService';

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

    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const previousSnapshots: SongMetadataSnapshot[] = [];
    const updatedSnapshots: SongMetadataSnapshot[] = [];

    for (const mut of mutations) {
      if (!mut.filePath) {
        failedCount++;
        errors.push(`Resource ${mut.resourceId} missing file path`);
        continue;
      }

      const tagPayload: Record<string, string | number | Buffer> = {};
      const fieldMap: Record<string, string | number> = {};
      const previousState: Record<string, string | number | undefined> = {};

      for (const fm of mut.fieldMutations) {
        if (fm.newValue !== undefined) {
          tagPayload[fm.fieldId] = fm.newValue;
          fieldMap[fm.fieldId] = fm.newValue;
          previousState[fm.fieldId] = fm.oldValue;
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

          previousSnapshots.push({
            songId: Number(mut.resourceId),
            path: mut.filePath,
            title: (previousState.title as string) ?? '',
            artist: previousState.artist as string | undefined,
            album: previousState.album as string | undefined,
            year: previousState.year as number | undefined
          });

          updatedSnapshots.push({
            songId: Number(mut.resourceId),
            path: mut.filePath,
            title: (fieldMap.title as string) ?? '',
            artist: fieldMap.artist as string | undefined,
            album: fieldMap.album as string | undefined,
            year: fieldMap.year as number | undefined
          });

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

    // Push transaction history snapshot if at least one track succeeded
    if (previousSnapshots.length > 0) {
      const historySnapshot: MetadataHistorySnapshot = {
        id: undoToken.id,
        timestamp: undoToken.timestamp,
        description: undoToken.description,
        songIds: previousSnapshots.map((s) => s.songId),
        previousSongs: previousSnapshots,
        updatedSongs: updatedSnapshots
      };
      this.historyService.pushSnapshot(historySnapshot);
    }

    return {
      success: errors.length === 0,
      updatedCount,
      failedCount,
      errors,
      undoToken: previousSnapshots.length > 0 ? undoToken : undefined
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

      try {
        const results = await this.tagWriter.writeBatch([
          { filePath: song.path, tags: revertTags }
        ]);

        if (results[0]?.success) {
          await this.relationalSync.syncRelationalDatabase(song.songId, song.path, revertTags);
          revertedCount++;
        } else {
          errors.push(results[0]?.error ?? `Failed to revert tags for ${song.path}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
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
