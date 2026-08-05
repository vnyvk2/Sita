import { EventEmitter } from 'events';
import type { AlbumMetadata, MetadataProviderId } from '../models/RecordingMetadata';
import type { AlbumTagPreview, AutoTagStage, ProgressEventPayload } from '../models/AlbumTagPreview';
import type { LocalSongInput } from './AlbumMetadataService';
import { AlbumMetadataService, getConfidenceLevel } from './AlbumMetadataService';
import { MetadataDiffBuilder } from '../diff/MetadataDiffBuilder';
import { MetadataApplyService, type ApplyResult } from './MetadataApplyService';

export interface AlbumAutoTagServiceOptions {
  albumMetadataService: AlbumMetadataService;
  applyService?: MetadataApplyService;
}

export class AlbumAutoTagService extends EventEmitter {
  private readonly metadataService: AlbumMetadataService;
  private readonly applyService: MetadataApplyService;
  private readonly activeOperations: Map<string, AbortController> = new Map();
  private stageState: AutoTagStage = 'idle';

  constructor(options: AlbumAutoTagServiceOptions) {
    super();
    this.metadataService = options.albumMetadataService;
    this.applyService = options.applyService ?? new MetadataApplyService();
  }

  public get currentStage(): AutoTagStage {
    return this.stageState;
  }

  public get applyManager(): MetadataApplyService {
    return this.applyService;
  }

  /**
   * Search album releases with progress reporting and cancellation support.
   */
  public async searchReleases(
    albumName: string,
    artistName?: string,
    limit = 10,
    signal?: AbortSignal,
    operationId = 'default'
  ): Promise<AlbumMetadata[]> {
    this.checkCancelled(signal, operationId);
    this.emitProgress('searching', `Searching album releases for "${albumName}"...`, 10, operationId);

    try {
      const results = await this.metadataService.search(albumName, artistName, limit);
      this.checkCancelled(signal, operationId);
      this.emitProgress('idle', `Found ${results.length} release candidates.`, 100, operationId);
      return results;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Search cancelled.', 0, operationId);
        return [];
      }
      this.emitProgress('failed', `Search failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    }
  }

  /**
   * Build complete AutoTag preview diff for local songs against a selected release.
   */
  public async buildPreview(
    localSongs: LocalSongInput[],
    releaseId: string,
    providerId?: MetadataProviderId,
    signal?: AbortSignal,
    operationId = 'default'
  ): Promise<AlbumTagPreview> {
    this.checkCancelled(signal, operationId);
    this.emitProgress('resolving', `Resolving release details for ${releaseId}...`, 30, operationId);

    try {
      const resolved = await this.metadataService.resolveRelease(releaseId, providerId);
      this.checkCancelled(signal, operationId);

      if (!resolved) {
        throw new Error(`Unable to resolve release details for ID '${releaseId}'`);
      }

      this.emitProgress('matching', `Matching ${localSongs.length} local songs against release tracks...`, 60, operationId);
      const albumPreview = await this.metadataService.buildAlbumMatch(localSongs, resolved.album, resolved.tracks);
      this.checkCancelled(signal, operationId);

      this.emitProgress('diffing', 'Building presentation-friendly metadata diffs...', 85, operationId);
      const trackPreviews = albumPreview.trackList.map((pair) => MetadataDiffBuilder.buildTrackPreview(pair));

      const overallConfidenceLevel = getConfidenceLevel(albumPreview.confidence);

      const preview: AlbumTagPreview = {
        album: albumPreview.album,
        matches: trackPreviews,
        warnings: albumPreview.warnings,
        overallConfidence: albumPreview.confidence,
        confidenceLevel: overallConfidenceLevel,
        provider: resolved.provider,
        providerReleaseId: resolved.providerReleaseId,
        resolvedRelease: resolved
      };

      this.emitProgress('idle', 'Preview ready for review.', 100, operationId);
      return preview;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Preview building cancelled.', 0, operationId);
        throw err;
      }
      this.emitProgress('failed', `Preview build failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    }
  }

  /**
   * Apply preview changes to disk and database.
   */
  public async applyPreview(preview: AlbumTagPreview, signal?: AbortSignal, operationId = 'default'): Promise<ApplyResult> {
    this.checkCancelled(signal, operationId);
    this.emitProgress('applying', `Applying metadata updates for ${preview.album.title}...`, 20, operationId);

    try {
      const result = await this.applyService.applyPreview(preview);
      this.checkCancelled(signal, operationId);

      if (result.success) {
        this.emitProgress('completed', `Successfully updated ${result.updatedCount} songs.`, 100, operationId);
      } else {
        this.emitProgress('failed', `Applied with errors: ${result.errors.join('; ')}`, 100, operationId);
      }

      return result;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Apply cancelled.', 0, operationId);
        throw err;
      }
      this.emitProgress('failed', `Apply failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    }
  }

  /**
   * Undoes the last AutoTag transaction.
   */
  public async undoLastAutoTag(operationId = 'default'): Promise<{ success: boolean; restoredCount: number }> {
    this.emitProgress('applying', 'Undoing last AutoTag operation...', 50, operationId);
    const res = await this.applyService.undoLastAutoTag();
    if (res.success) {
      this.emitProgress('completed', `Restored original metadata for ${res.restoredCount} songs.`, 100, operationId);
    } else {
      this.emitProgress('failed', 'No AutoTag operations available to undo.', 0, operationId);
    }
    return res;
  }

  /**
   * Cancels an active operation by ID.
   */
  public cancel(operationId = 'default'): void {
    const controller = this.activeOperations.get(operationId);
    if (controller) {
      controller.abort();
      this.activeOperations.delete(operationId);
      this.emitProgress('cancelled', `Operation '${operationId}' cancelled by user.`, 0, operationId);
    }
  }

  public createAbortSignal(operationId = 'default'): AbortSignal {
    this.cancel(operationId);
    const controller = new AbortController();
    this.activeOperations.set(operationId, controller);
    return controller.signal;
  }

  private emitProgress(stage: AutoTagStage, message: string, progressPercent?: number, operationId = 'default'): void {
    this.stageState = stage;
    const payload: ProgressEventPayload = { stage, message, progressPercent, operationId };
    this.emit('progress', payload);
  }

  private checkCancelled(signal?: AbortSignal, operationId = 'default'): void {
    if (signal?.aborted || this.activeOperations.get(operationId)?.signal.aborted) {
      const err = new Error('Operation aborted');
      err.name = 'AbortError';
      throw err;
    }
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
  }
}
