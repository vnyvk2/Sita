import type { MetadataProviderExecutor } from '../engine/MetadataProviderExecutor';
import type { ProviderCandidate } from '../domain/MetadataResolution';

export interface LookupQueryOptions {
  albumTitle?: string;
  artistName?: string;
  trackTitle?: string;
}

export interface MetadataLookupGateway {
  searchCandidates(options: LookupQueryOptions): Promise<ProviderCandidate[]>;
}

export class DefaultMetadataLookupGateway implements MetadataLookupGateway {
  private readonly executor?: MetadataProviderExecutor;

  constructor(executor?: MetadataProviderExecutor) {
    this.executor = executor;
  }

  public async searchCandidates(options: LookupQueryOptions): Promise<ProviderCandidate[]> {
    if (!options.albumTitle && !options.trackTitle) {
      return [];
    }

    if (this.executor) {
      try {
        const results = await this.executor.executeAll({
          title: options.albumTitle ?? options.trackTitle,
          artist: options.artistName
        });

        const candidates: ProviderCandidate[] = [];
        for (const res of results) {
          if (res.success && res.data) {
            candidates.push({
              providerId: res.providerId,
              providerName: res.providerId === 'musicbrainz' ? 'MusicBrainz' : res.providerId,
              externalId: res.data.mbid ?? res.providerId,
              title: res.data.title ?? options.albumTitle ?? '',
              artist: res.data.artist ?? options.artistName ?? '',
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
}
