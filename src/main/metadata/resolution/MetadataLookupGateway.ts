import type { MetadataProviderExecutor } from '../engine/MetadataProviderExecutor';
import type { ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataContext } from '../domain/MetadataContext';

export interface MetadataLookupGateway {
  searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]>;
}

export class DefaultMetadataLookupGateway implements MetadataLookupGateway {
  private readonly executor?: MetadataProviderExecutor;

  constructor(executor?: MetadataProviderExecutor) {
    this.executor = executor;
  }

  public async searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]> {
    const title = (context.query?.albumTitle ?? context.query?.trackTitle ?? context.query?.title) as string | undefined;
    const artist = (context.query?.artistName ?? context.query?.artist) as string | undefined;

    if (!title) {
      return [];
    }

    if (this.executor) {
      try {
        const results = await this.executor.executeAll({ title, artist });

        const candidates: ProviderCandidate[] = [];
        for (const res of results) {
          if (res.success && res.data) {
            candidates.push({
              providerId: res.providerId,
              providerName: res.providerId === 'musicbrainz' ? 'MusicBrainz' : res.providerId,
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
}
