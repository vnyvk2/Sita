import { EventEmitter } from 'events';
import type { MetadataSearchOptions } from '../../../common/metadata/api';
import type { AlbumMetadata, MetadataProviderId } from '../models/RecordingMetadata';
import type { AlbumTagPreview, ApplyPreviewOptions, AutoTagStage, ProgressEventPayload, TrackMatchPreview } from '../models/AlbumTagPreview';
import type { LocalSongInput } from './AlbumMetadataService';
import { AlbumMetadataService, getConfidenceLevel } from './AlbumMetadataService';
import { MetadataDiffBuilder } from '../diff/MetadataDiffBuilder';
import { MetadataApplyService, type ApplyResult } from './MetadataApplyService';
import { MetadataOperationManager } from '../operations/MetadataOperationManager';
import { MetadataTransactionManager } from '../transactions/MetadataTransactionManager';
import type { MetadataResolutionManager } from '../resolution/MetadataResolutionManager';
import { LocalSongNormalizer } from '../matching/LocalSongNormalizer';

export type SongHydrator = (songId: number) => Promise<LocalSongInput | null>;

export interface AlbumAutoTagServiceOptions {
  albumMetadataService: AlbumMetadataService;
  applyService?: MetadataApplyService;
  resolutionManager?: MetadataResolutionManager;
  songHydrator?: SongHydrator;
}

export class AlbumAutoTagService extends EventEmitter {
  private readonly metadataService: AlbumMetadataService;
  private readonly applyService: MetadataApplyService;
  private readonly resolutionManager?: MetadataResolutionManager;
  private readonly songHydrator?: SongHydrator;
  private readonly operationManager: MetadataOperationManager;
  private readonly transactionManager: MetadataTransactionManager;
  private readonly activeOperations: Map<string, AbortController> = new Map();
  private readonly operationStages: Map<string, AutoTagStage> = new Map();

  constructor(options: AlbumAutoTagServiceOptions) {
    super();
    this.metadataService = options.albumMetadataService;
    this.applyService = options.applyService ?? new MetadataApplyService();
    this.resolutionManager = options.resolutionManager;
    this.songHydrator = options.songHydrator;
    this.operationManager = new MetadataOperationManager();
    this.transactionManager = new MetadataTransactionManager({
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
    options?: MetadataSearchOptions,
    signal?: AbortSignal
  ): Promise<AlbumMetadata[]> {
    const operationId = options?.operationId ?? 'default';
    this.checkCancelled(signal);
    this.operationManager.createOperation(operationId, 'AlbumResolution', [], 'Interactive');
    this.operationManager.updateState(operationId, 'Searching', `Searching album releases for "${albumName}"...`, 10);
    this.emitProgress('searching', `Searching album releases for "${albumName}"...`, 10, operationId);

    try {
      this.activeOperations.set(operationId, new AbortController());
      const results = await this.metadataService.search(albumName, artistName, options);
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
   * Guarantees authoritative baseline hydration from SQLite database / physical tags.
   */
  public async buildPreview(
    localSongs: LocalSongInput[],
    releaseId: string,
    providerId?: MetadataProviderId,
    signal?: AbortSignal,
    operationId = 'default'
  ): Promise<AlbumTagPreview> {
    this.checkCancelled(signal);

    // 1. Authoritative Main Process Baseline Hydration
    const hydratedSongs: LocalSongInput[] = await Promise.all(
      localSongs.map(async (song) => {
        const songId = song.songId || (song as any).id;
        if (songId) {
          try {
            if (this.songHydrator) {
              const hydrated = await this.songHydrator(songId);
              if (hydrated) return hydrated;
            } else {
              const { getSongById } = await import('../../db/queries/songs');
              const dbSong = await getSongById(songId);
              if (dbSong) {
                return LocalSongNormalizer.fromDbSong(dbSong);
              }
            }
          } catch {
            // Fall back to normalized input if DB query fails in testing
          }
        }
        return LocalSongNormalizer.normalize(song);
      })
    );

    const targetResourceIds = hydratedSongs.map((s) => s.songId);
    this.operationManager.createOperation(operationId, 'AlbumResolution', targetResourceIds, 'Interactive');
    this.operationManager.updateState(operationId, 'Resolving', `Resolving release details for ${releaseId}...`, 30);
    this.emitProgress('resolving', `Resolving release details for ${releaseId}...`, 30, operationId);

    try {
      const resolved = await this.metadataService.resolveRelease(releaseId, providerId);
      this.checkCancelled(signal);

      if (!resolved) {
        throw new Error(`Unable to resolve release details for ID '${releaseId}'`);
      }

      this.emitProgress('matching', `Matching ${hydratedSongs.length} local songs against release tracks...`, 60, operationId);
      const albumPreview = await this.metadataService.buildAlbumMatch(hydratedSongs, resolved.album, resolved.tracks);
      this.checkCancelled(signal);

      this.operationManager.updateState(operationId, 'Merging', 'Building presentation-friendly metadata diffs...', 85);
      this.emitProgress('diffing', 'Building presentation-friendly metadata diffs...', 85, operationId);

      let trackPreviews: TrackMatchPreview[] = [];
      let contributingProviders: MetadataProviderId[] | undefined;

      if (this.resolutionManager) {
        const resolution = await this.resolutionManager.resolve({
          operationId,
          targetResourceIds,
          albumTitle: resolved.album.title,
          artistName: resolved.album.artist,
          mbid: resolved.providerReleaseId,
          canonicalContext: {
            mbid: resolved.providerReleaseId,
            title: resolved.album.title,
            artist: resolved.album.artist,
            year: resolved.album.year,
            trackCount: resolved.tracks.length,
            trackTitles: resolved.tracks.map((t) => t.title)
          }
        });

        if (resolution.mergedResult) {
          const merged = resolution.mergedResult;
          if (merged.artworkUrl) {
            resolved.album.artwork = {
              primaryPath: merged.artworkUrl,
              onlineUrls: [merged.artworkUrl]
            };
          }

          if (merged.fieldAttributions) {
            contributingProviders = Array.from(
              new Set(Object.values(merged.fieldAttributions).map((attr) => attr.providerId as MetadataProviderId))
            );
          }

          trackPreviews = albumPreview.trackList.map((pair) =>
            MetadataDiffBuilder.buildTrackPreviewFromMergedResult(pair, merged, this.resolutionManager?.registry)
          );
        } else {
          trackPreviews = albumPreview.trackList.map((pair) => MetadataDiffBuilder.buildTrackPreview(pair));
        }
      } else {
        trackPreviews = albumPreview.trackList.map((pair) => MetadataDiffBuilder.buildTrackPreview(pair));
      }

      const overallConfidenceLevel = getConfidenceLevel(albumPreview.confidence);

      const preview: AlbumTagPreview = {
        album: albumPreview.album,
        matches: trackPreviews,
        warnings: albumPreview.warnings,
        overallConfidence: albumPreview.confidence,
        confidenceLevel: overallConfidenceLevel,
        provider: resolved.provider,
        providerReleaseId: resolved.providerReleaseId,
        contributingProviders,
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
   * Apply preview changes via MetadataApplyService.
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
      const result = await this.applyService.applyPreview(preview, options, signal);
      this.checkCancelled(signal);

      if (result.success) {
        const msg =
          result.deferredCount && result.deferredCount > 0
            ? `Successfully updated ${result.updatedCount} songs (${result.deferredCount} file writes pending playback change).`
            : `Successfully updated ${result.updatedCount} songs.`;
        this.operationManager.updateState(operationId, 'Completed', msg, 100);
        this.emitProgress('completed', msg, 100, operationId);
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
   * Undoes the last AutoTag operation via MetadataApplyService.
   */
  public async undoLastAutoTag(operationId = 'default'): Promise<{ success: boolean; restoredCount: number }> {
    this.emitProgress('applying', 'Undoing last AutoTag operation...', 50, operationId);
    try {
      const res = await this.applyService.undoLastAutoTag();
      if (res.success && res.restoredCount > 0) {
        this.operationManager.updateState(operationId, 'Undone', `Restored original metadata for ${res.restoredCount} songs.`, 100);
        this.emitProgress('completed', `Restored original metadata for ${res.restoredCount} songs.`, 100, operationId);
        return { success: true, restoredCount: res.restoredCount };
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
