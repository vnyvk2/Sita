import type { MetadataProviderExecutor } from '../engine/MetadataProviderExecutor';
import type { ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataContext, AlbumLookupQuery, TrackLookupQuery } from '../domain/MetadataContext';
import { ProviderRegistry } from './ProviderRegistry';

export interface MetadataLookupGateway {
  searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]>;
}

export class DefaultMetadataLookupGateway implements MetadataLookupGateway {
  private readonly executor?: MetadataProviderExecutor;
  private readonly providerRegistry: ProviderRegistry;

  constructor(executor?: MetadataProviderExecutor, providerRegistry?: ProviderRegistry) {
    this.executor = executor;
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();
  }

  public async searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]> {
    const requestQuery = context.request?.query;
    if (!requestQuery) return [];

    let title: string | undefined;
    let artist: string | undefined;

    if ('albumTitle' in requestQuery) {
      const q = requestQuery as AlbumLookupQuery;
      title = q.albumTitle;
      artist = q.artistName;
    } else if ('trackTitle' in requestQuery) {
      const q = requestQuery as TrackLookupQuery;
      title = q.trackTitle;
      artist = q.artistName;
    }

    if (!title) return [];

    const candidates: ProviderCandidate[] = [];

    // 1. Check registry-driven active provider instances first
    const activeInstances = this.providerRegistry.getActiveInstances();
    if (activeInstances.size > 0) {
      for (const [providerId, provider] of activeInstances.entries()) {
        try {
          const result = await provider.fetchMetadata({ title, artist });
          if (result) {
            candidates.push({
              providerId,
              providerName: this.providerRegistry.getDisplayName(providerId),
              externalId: result.mbid ?? providerId,
              title: result.title ?? title,
              artist: result.artist ?? artist ?? '',
              score: 0.95,
              matchedAttributes: {
                title: result.title ?? '',
                artist: result.artist ?? '',
                album: result.album ?? '',
                genre: result.genres?.[0] ?? ''
              }
            });
          }
        } catch (_err) {
          // Ignore individual provider lookup errors gracefully
        }
      }
      if (candidates.length > 0) {
        return candidates;
      }
    }

    // 2. Fall back to executor if set
    if (this.executor) {
      try {
        const results = await this.executor.executeAll({ title, artist });

        for (const res of results) {
          if (res.success && res.data) {
            candidates.push({
              providerId: res.providerId,
              providerName: this.providerRegistry.getDisplayName(res.providerId),
              externalId: res.data.mbid ?? res.providerId,
              title: res.data.title ?? title,
              artist: res.data.artist ?? artist ?? '',
              score: 0.9,
              matchedAttributes: {
                title: res.data.title ?? '',
                artist: res.data.artist ?? ''
              }
            });
          }
        }
        return candidates;
      } catch (_err) {
        return [];
      }
    }

    return [];
  }

  public get registry(): ProviderRegistry {
    return this.providerRegistry;
  }
}
