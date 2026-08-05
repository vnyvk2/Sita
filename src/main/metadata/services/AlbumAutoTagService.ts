import { EventEmitter } from 'events';
import type { AlbumMetadata, MetadataProviderId } from '../models/RecordingMetadata';
import type { AlbumTagPreview, AutoTagStage, ProgressEventPayload } from '../models/AlbumTagPreview';
import type { LocalSongInput } from './AlbumMetadataService';
import { AlbumMetadataService } from './AlbumMetadataService';
import { MetadataDiffBuilder } from '../diff/MetadataDiffBuilder';
import { MetadataApplyService, type ApplyResult } from './MetadataApplyService';

export interface AlbumAutoTagServiceOptions {
  albumMetadataService: AlbumMetadataService;
  applyService?: MetadataApplyService;
}

export class AlbumAutoTagService extends EventEmitter {
  private readonly metadataService: AlbumMetadataService;
  private readonly applyService: MetadataApplyService;
  private currentAbortController?: AbortController;
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
    signal?: AbortSignal
  ): Promise<AlbumMetadata[]> {
    this.checkCancelled(signal);
    this.emitProgress('searching', `Searching album releases for "${albumName}"...`, 10);

    try {
      const results = await this.metadataService.search(albumName, artistName, limit);
      this.checkCancelled(signal);
      this.emitProgress('idle', `Found ${results.length} release candidates.`, 100);
      return results;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Search cancelled.', 0);
        return [];
      }
      this.emitProgress('failed', `Search failed: ${err instanceof Error ? err.message : String(err)}`, 0);
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
    signal?: AbortSignal
  ): Promise<AlbumTagPreview> {
    this.checkCancelled(signal);
    this.emitProgress('resolving', `Resolving release details for ${releaseId}...`, 30);

    try {
      const resolved = await this.metadataService.resolveRelease(releaseId, providerId);
      this.checkCancelled(signal);

      if (!resolved) {
        throw new Error(`Unable to resolve release details for ID '${releaseId}'`);
      }

      this.emitProgress('matching', `Matching ${localSongs.length} local songs against release tracks...`, 60);
      const albumPreview = await this.metadataService.buildAlbumMatch(localSongs, resolved.album, resolved.tracks);
      this.checkCancelled(signal);

      this.emitProgress('diffing', 'Building presentation-friendly metadata diffs...', 85);
      const trackPreviews = albumPreview.trackList.map((pair) => MetadataDiffBuilder.buildTrackPreview(pair));

      const preview: AlbumTagPreview = {
        album: albumPreview.album,
        matches: trackPreviews,
        warnings: albumPreview.warnings,
        overallConfidence: albumPreview.confidence,
        confidenceLevel: trackPreviews[0]?.confidenceLevel ?? 'Good',
        provider: resolved.provider,
        providerReleaseId: resolved.providerReleaseId
      };

      this.emitProgress('idle', 'Preview ready for review.', 100);
      return preview;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Preview building cancelled.', 0);
        throw err;
      }
      this.emitProgress('failed', `Preview build failed: ${err instanceof Error ? err.message : String(err)}`, 0);
      throw err;
    }
  }

  /**
   * Apply preview changes to disk and database.
   */
  public async applyPreview(preview: AlbumTagPreview, signal?: AbortSignal): Promise<ApplyResult> {
    this.checkCancelled(signal);
    this.emitProgress('applying', `Applying metadata updates for ${preview.album.title}...`, 20);

    try {
      const result = await this.applyService.applyPreview(preview);
      this.checkCancelled(signal);

      if (result.success) {
        this.emitProgress('completed', `Successfully updated ${result.updatedCount} songs.`, 100);
      } else {
        this.emitProgress('failed', `Applied with errors: ${result.errors.join('; ')}`, 100);
      }

      return result;
    } catch (err: unknown) {
      if (this.isAbortError(err)) {
        this.emitProgress('cancelled', 'Apply cancelled.', 0);
        throw err;
      }
      this.emitProgress('failed', `Apply failed: ${err instanceof Error ? err.message : String(err)}`, 0);
      throw err;
    }
  }

  /**
   * Undoes the last AutoTag transaction.
   */
  public async undoLastAutoTag(): Promise<{ success: boolean; restoredCount: number }> {
    this.emitProgress('applying', 'Undoing last AutoTag operation...', 50);
    const res = await this.applyService.undoLastAutoTag();
    if (res.success) {
      this.emitProgress('completed', `Restored original metadata for ${res.restoredCount} songs.`, 100);
    } else {
      this.emitProgress('failed', 'No AutoTag operations available to undo.', 0);
    }
    return res;
  }

  /**
   * Cancels any active operation.
   */
  public cancel(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = undefined;
      this.emitProgress('cancelled', 'Operation cancelled by user.', 0);
    }
  }

  public createAbortSignal(): AbortSignal {
    this.cancel();
    this.currentAbortController = new AbortController();
    return this.currentAbortController.signal;
  }

  private emitProgress(stage: AutoTagStage, message: string, progressPercent?: number): void {
    this.stageState = stage;
    const payload: ProgressEventPayload = { stage, message, progressPercent };
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
