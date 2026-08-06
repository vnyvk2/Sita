import type { MetadataProviderExecutor } from '../engine/MetadataProviderExecutor';
import type { MetadataMergeEngine } from '../engine/MetadataMergeEngine';
import type { MetadataResolution, ProviderCandidate } from '../domain/MetadataResolution';
import type { AlbumMetadataService } from '../services/AlbumMetadataService';

export interface ResolutionOptions {
  albumTitle?: string;
  artistName?: string;
  albumIds?: number[];
}

export class MetadataResolutionManager {
  private readonly albumMetadataService?: AlbumMetadataService;
  private readonly executor?: MetadataProviderExecutor;
  private readonly mergeEngine?: MetadataMergeEngine;

  constructor(options?: {
    albumMetadataService?: AlbumMetadataService;
    executor?: MetadataProviderExecutor;
    mergeEngine?: MetadataMergeEngine;
  }) {
    this.albumMetadataService = options?.albumMetadataService;
    this.executor = options?.executor;
    this.mergeEngine = options?.mergeEngine;
  }

  /**
   * Performs candidate resolution across registered providers.
   */
  public async resolveCandidates(
    operationId: string,
    resourceId: string | number,
    options: ResolutionOptions
  ): Promise<MetadataResolution> {
    const candidates: ProviderCandidate[] = [];

    if (this.albumMetadataService && options.albumTitle) {
      try {
        const searchResults = await this.albumMetadataService.searchAlbums(
          options.albumTitle,
          options.artistName
        );

        for (const res of searchResults) {
          candidates.push({
            providerId: res.provider,
            providerName: res.provider === 'musicbrainz' ? 'MusicBrainz' : res.provider,
            externalId: res.id,
            title: res.title,
            artist: res.artist,
            year: res.year,
            score: res.score ?? 0.9,
            matchedAttributes: {
              title: res.title,
              artist: res.artist
            }
          });
        }
      } catch (_err) {
        // Fallback gracefully on search error
      }
    }

    return {
      operationId,
      resourceId,
      candidates,
      resolvedAt: Date.now()
    };
  }
}
