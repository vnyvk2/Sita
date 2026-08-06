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

    if (this.executor) {
      try {
        const results = await this.executor.executeAll({ title, artist });

        const candidates: ProviderCandidate[] = [];
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
