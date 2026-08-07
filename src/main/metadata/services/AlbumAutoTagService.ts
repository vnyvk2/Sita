import { EventEmitter } from 'events';
import type { AlbumMetadata, MetadataProviderId } from '../models/RecordingMetadata';
import type { AlbumTagPreview, ApplyPreviewOptions, AutoTagStage, ProgressEventPayload } from '../models/AlbumTagPreview';
import type { LocalSongInput } from './AlbumMetadataService';
import { AlbumMetadataService, getConfidenceLevel } from './AlbumMetadataService';
import { MetadataDiffBuilder } from '../diff/MetadataDiffBuilder';
import { MetadataApplyService, type ApplyResult } from './MetadataApplyService';
import { MetadataOperationManager } from '../operations/MetadataOperationManager';
import { MetadataTransactionManager } from '../transactions/MetadataTransactionManager';
import type { ResourceMutationPayload } from '../domain/MetadataTransaction';
import type { MetadataResolutionManager } from '../resolution/MetadataResolutionManager';
import type { MetadataContext } from '../domain/MetadataContext';

export interface AlbumAutoTagServiceOptions {
  albumMetadataService: AlbumMetadataService;
  applyService?: MetadataApplyService;
  resolutionManager?: MetadataResolutionManager;
}

export class AlbumAutoTagService extends EventEmitter {
  private readonly metadataService: AlbumMetadataService;
  private readonly applyService: MetadataApplyService;
  private readonly resolutionManager?: MetadataResolutionManager;
  private readonly operationManager: MetadataOperationManager;
  private readonly transactionManager: MetadataTransactionManager;
  private readonly activeOperations: Map<string, AbortController> = new Map();
  private readonly operationStages: Map<string, AutoTagStage> = new Map();

  constructor(options: AlbumAutoTagServiceOptions) {
    super();
    this.metadataService = options.albumMetadataService;
    this.applyService = options.applyService ?? new MetadataApplyService();
    this.resolutionManager = options.resolutionManager;
    this.operationManager = new MetadataOperationManager();
    this.transactionManager = new MetadataTransactionManager({
      tagWriter: this.applyService.writer,
      dbUpdater: this.applyService.updater,
      historyService: this.applyService.history
    });
  }

  public getStage(operationId = 'default'): AutoTagStage {
    return this.operationStages.get(operationId) ?? 'idle';
  }

  public get applyManager(): MetadataApplyService {
    return this.applyService;
  }

  public get operations(): MetadataOperationManager {
    return this.operationManager;
  }

  public get transactions(): MetadataTransactionManager {
    return this.transactionManager;
  }

  /**
   * Search album releases with progress reporting and cancellation support via MetadataOperation.
   */
  public async searchReleases(
    albumName: string,
    artistName?: string,
    limit = 10,
    signal?: AbortSignal,
    operationId = 'default'
  ): Promise<AlbumMetadata[]> {
    this.checkCancelled(signal);
    this.operationManager.createOperation(operationId, 'AlbumResolution', [], 'Interactive');
    this.operationManager.updateState(operationId, 'Searching', `Searching album releases for "${albumName}"...`, 10);
    this.emitProgress('searching', `Searching album releases for "${albumName}"...`, 10, operationId);

    try {
      if (this.resolutionManager) {
        const resolutionContext: MetadataContext = {
          resources: { targetResources: [] },
          execution: { executionMode: 'Interactive', stage: 'Searching' },
          request: {
            query: { albumTitle: albumName, artistName },
            targetFieldIds: ['title', 'artist', 'album', 'genre', 'artworkUrl']
          }
        };
        const resolution = await this.resolutionManager.resolve(operationId, resolutionContext);
        if (resolution && resolution.candidates && resolution.candidates.length > 0) {
          const mappedResults: AlbumMetadata[] = resolution.candidates.map((cand) => ({
            releaseId: cand.externalId,
            title: cand.title,
            artist: cand.artist,
            year: typeof cand.matchedAttributes.year === 'number' ? cand.matchedAttributes.year : undefined,
            coverArtUrl: cand.matchedAttributes.artworkUrl,
            tracks: []
          }));
          this.checkCancelled(signal);
          this.operationManager.updateState(operationId, 'Completed', `Found ${mappedResults.length} release candidates.`, 100);
          this.emitProgress('completed', `Found ${mappedResults.length} release candidates.`, 100, operationId);
          return mappedResults;
        }
      }

      const results = await this.metadataService.search(albumName, artistName, limit);
      this.checkCancelled(signal);
      this.operationManager.updateState(operationId, 'Completed', `Found ${results.length} release candidates.`, 100);
      this.emitProgress('completed', `Found ${results.length} release candidates.`, 100, operationId);
      return results;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.operationManager.updateState(operationId, 'Cancelled', 'Search cancelled.', 0);
        this.emitProgress('cancelled', 'Search cancelled.', 0, operationId);
        return [];
      }
      this.operationManager.updateState(operationId, 'Failed', `Search failed: ${err instanceof Error ? err.message : String(err)}`, 0);
      this.emitProgress('failed', `Search failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    } finally {
      this.activeOperations.delete(operationId);
      this.operationStages.delete(operationId);
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
    this.checkCancelled(signal);
    const targetResourceIds = localSongs.map((s) => s.songId);
    this.operationManager.createOperation(operationId, 'AlbumResolution', targetResourceIds, 'Interactive');
    this.operationManager.updateState(operationId, 'Resolving', `Resolving release details for ${releaseId}...`, 30);
    this.emitProgress('resolving', `Resolving release details for ${releaseId}...`, 30, operationId);

    try {
      const resolved = await this.metadataService.resolveRelease(releaseId, providerId);
      this.checkCancelled(signal);

      if (!resolved) {
        throw new Error(`Unable to resolve release details for ID '${releaseId}'`);
      }

      this.emitProgress('matching', `Matching ${localSongs.length} local songs against release tracks...`, 60, operationId);
      const albumPreview = await this.metadataService.buildAlbumMatch(localSongs, resolved.album, resolved.tracks);
      this.checkCancelled(signal);

      this.operationManager.updateState(operationId, 'Merging', 'Building presentation-friendly metadata diffs...', 85);
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

      this.operationManager.updateState(operationId, 'PreviewReady', 'Preview ready for review.', 100);
      this.emitProgress('completed', 'Preview ready for review.', 100, operationId);
      return preview;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.operationManager.updateState(operationId, 'Cancelled', 'Preview building cancelled.', 0);
        this.emitProgress('cancelled', 'Preview building cancelled.', 0, operationId);
        throw err;
      }
      this.operationManager.updateState(operationId, 'Failed', `Preview build failed: ${err instanceof Error ? err.message : String(err)}`, 0);
      this.emitProgress('failed', `Preview build failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    } finally {
      this.activeOperations.delete(operationId);
      this.operationStages.delete(operationId);
    }
  }

  /**
   * Apply preview changes via MetadataTransactionManager.
   */
  public async applyPreview(
    preview: AlbumTagPreview,
    options?: ApplyPreviewOptions,
    signal?: AbortSignal,
    operationId = 'default'
  ): Promise<ApplyResult> {
    this.checkCancelled(signal);
    this.operationManager.updateState(operationId, 'Applying', `Applying metadata updates for ${preview.album.title}...`, 20);
    this.emitProgress('applying', `Applying metadata updates for ${preview.album.title}...`, 20, operationId);

    try {
      // Build domain transaction mutations
      const selectedMatches = preview.matches.filter((m) => m.applyTrack);
      const mutations: ResourceMutationPayload[] = selectedMatches.map((m) => ({
        resourceId: m.localSongId,
        filePath: m.songPath,
        fieldMutations: m.fieldDiffs
          .filter((d) => d.applyField && d.status !== 'unchanged')
          .map((d) => ({
            fieldId: d.fieldId,
            oldValue: d.oldValue,
            newValue: d.userValue ?? d.suggestedValue,
            providerId: preview.provider,
            confidenceScore: m.confidence
          }))
      }));

      const txResult = await this.transactionManager.executeTransaction(operationId, mutations, options);
      this.checkCancelled(signal);

      const result: ApplyResult = {
        success: txResult.success,
        updatedCount: txResult.updatedCount,
        failedCount: txResult.failedCount,
        errors: txResult.errors
      };

      if (result.success) {
        this.operationManager.updateState(operationId, 'Completed', `Successfully updated ${result.updatedCount} songs.`, 100);
        this.emitProgress('completed', `Successfully updated ${result.updatedCount} songs.`, 100, operationId);
      } else {
        this.operationManager.updateState(operationId, 'Failed', `Applied with errors: ${result.errors.join('; ')}`, 100);
        this.emitProgress('failed', `Applied with errors: ${result.errors.join('; ')}`, 100, operationId);
      }

      return result;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.operationManager.updateState(operationId, 'Cancelled', 'Apply cancelled.', 0);
        this.emitProgress('cancelled', 'Apply cancelled.', 0, operationId);
        throw err;
      }
      this.operationManager.updateState(operationId, 'Failed', `Apply failed: ${err instanceof Error ? err.message : String(err)}`, 0);
      this.emitProgress('failed', `Apply failed: ${err instanceof Error ? err.message : String(err)}`, 0, operationId);
      throw err;
    } finally {
      this.activeOperations.delete(operationId);
      this.operationStages.delete(operationId);
    }
  }

  /**
   * Undoes the last AutoTag transaction via MetadataTransactionManager.
   */
  public async undoLastAutoTag(operationId = 'default'): Promise<{ success: boolean; restoredCount: number }> {
    this.emitProgress('applying', 'Undoing last AutoTag operation...', 50, operationId);
    try {
      const res = await this.transactionManager.rollbackLastTransaction();
      if (res.success && res.revertedCount > 0) {
        this.operationManager.updateState(operationId, 'Undone', `Restored original metadata for ${res.revertedCount} songs.`, 100);
        this.emitProgress('completed', `Restored original metadata for ${res.revertedCount} songs.`, 100, operationId);
        return { success: true, restoredCount: res.revertedCount };
      } else {
        this.operationManager.updateState(operationId, 'Failed', 'No AutoTag operations available to undo.', 0);
        this.emitProgress('failed', 'No AutoTag operations available to undo.', 0, operationId);
        return { success: false, restoredCount: 0 };
      }
    } finally {
      this.activeOperations.delete(operationId);
      this.operationStages.delete(operationId);
    }
  }

  /**
   * Cancels an active operation by ID.
   */
  public cancel(operationId = 'default'): void {
    const controller = this.activeOperations.get(operationId);
    if (controller) {
      controller.abort();
      this.operationManager.updateState(operationId, 'Cancelled', `Operation '${operationId}' cancelled by user.`, 0);
      this.emitProgress('cancelled', `Operation '${operationId}' cancelled by user.`, 0, operationId);
      this.activeOperations.delete(operationId);
      this.operationStages.delete(operationId);
    }
  }

  public createAbortSignal(operationId = 'default'): AbortSignal {
    this.cancel(operationId);
    const controller = new AbortController();
    this.activeOperations.set(operationId, controller);
    return controller.signal;
  }

  private emitProgress(stage: AutoTagStage, message: string, progressPercent?: number, operationId = 'default'): void {
    this.operationStages.set(operationId, stage);
    const payload: ProgressEventPayload = { stage, message, progressPercent, operationId };
    this.emit('progress', payload);
  }

  private checkCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      const err = new Error('Operation aborted');
      err.name = 'AbortError';
      throw err;
    }
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'));
  }
}
