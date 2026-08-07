import type { MetadataProviderExecutor } from '../engine/MetadataProviderExecutor';
import type { ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataContext, AlbumLookupQuery, TrackLookupQuery } from '../domain/MetadataContext';
import { ProviderRegistry } from './ProviderRegistry';
import type { FieldContribution } from './MetadataMergeEngine';
import type { IMetadataProviderAdapter } from '../contracts/IMetadataProviderAdapter';

export interface MetadataLookupGateway {
  searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]>;
  searchContributions?(context: MetadataContext): Promise<FieldContribution[]>;
}

export class DefaultMetadataLookupGateway implements MetadataLookupGateway {
  private readonly executor?: MetadataProviderExecutor;
  private readonly providerRegistry: ProviderRegistry;

  constructor(executor?: MetadataProviderExecutor, providerRegistry?: ProviderRegistry) {
    this.executor = executor;
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();
  }

  /**
   * Directly fetches specialized FieldContribution[] across registered active providers, bypassing intermediate full candidate objects.
   */
  public async searchContributions(context: MetadataContext): Promise<FieldContribution[]> {
    const requestQuery = context.request?.query;
    if (!requestQuery) return [];

    let title: string | undefined;
    let artist: string | undefined;
    let mbid: string | undefined;
    let releaseId: string | undefined;

    if ('albumTitle' in requestQuery) {
      const q = requestQuery as AlbumLookupQuery & { mbid?: string; releaseId?: string };
      title = q.albumTitle;
      artist = q.artistName;
      mbid = q.mbid;
      releaseId = q.releaseId;
    } else if ('trackTitle' in requestQuery) {
      const q = requestQuery as TrackLookupQuery & { mbid?: string; releaseId?: string };
      title = q.trackTitle;
      artist = q.artistName;
      mbid = q.mbid;
      releaseId = q.releaseId;
    }

    if (!title && !mbid && !releaseId) return [];

    const fieldContributions: FieldContribution[] = [];
    const activeInstances = this.providerRegistry.getActiveInstances();

    console.log('[MetadataLookupGateway] Incoming requestQuery:', requestQuery);
    console.log('[MetadataLookupGateway] Extracted query for adapters:', { title, artist, mbid, releaseId });
    console.log('[MetadataLookupGateway] Active Registered Provider Instances:', Array.from(activeInstances.keys()));

    for (const [providerId, instance] of activeInstances.entries()) {
      const adapter = instance as unknown as IMetadataProviderAdapter;
      if (adapter && typeof adapter.fetchContribution === 'function') {
        try {
          console.log(`[MetadataLookupGateway] Calling fetchContribution on '${providerId}' with:`, { title, artist, mbid, releaseId });
          const contrib = await adapter.fetchContribution({ title, artist, mbid, releaseId });
          console.log(`[MetadataLookupGateway] fetchContribution result from '${providerId}':`, contrib);
          if (contrib && contrib.contributions) {
            fieldContributions.push(...contrib.contributions);
          }
        } catch (err: unknown) {
          console.warn(`[MetadataLookupGateway] fetchContribution error from '${providerId}':`, err);
        }
      }
    }

    return fieldContributions;
  }

  public async searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]> {
    const requestQuery = context.request?.query;
    if (!requestQuery) return [];

    let title: string | undefined;
    let artist: string | undefined;
    let mbid: string | undefined;
    let releaseId: string | undefined;

    if ('albumTitle' in requestQuery) {
      const q = requestQuery as AlbumLookupQuery & { mbid?: string; releaseId?: string };
      title = q.albumTitle;
      artist = q.artistName;
      mbid = q.mbid;
      releaseId = q.releaseId;
    } else if ('trackTitle' in requestQuery) {
      const q = requestQuery as TrackLookupQuery & { mbid?: string; releaseId?: string };
      title = q.trackTitle;
      artist = q.artistName;
      mbid = q.mbid;
      releaseId = q.releaseId;
    }

    if (!title && !mbid && !releaseId) return [];

    const candidates: ProviderCandidate[] = [];

    // 1. Check registry-driven active provider instances first
    const activeInstances = this.providerRegistry.getActiveInstances();
    if (activeInstances.size > 0) {
      for (const [providerId, provider] of activeInstances.entries()) {
        const adapter = provider as unknown as IMetadataProviderAdapter;
        // Direct specialized contribution check
        if (adapter && typeof adapter.fetchContribution === 'function') {
          try {
            const contrib = await adapter.fetchContribution({ title, artist, mbid, releaseId });
            if (contrib && contrib.contributions.length > 0) {
              const titleContrib = contrib.contributions.find((c) => c.fieldId === 'title')?.value;
              const artistContrib = contrib.contributions.find((c) => c.fieldId === 'artist')?.value;
              const albumContrib = contrib.contributions.find((c) => c.fieldId === 'album')?.value;
              const genreContrib = contrib.contributions.find((c) => c.fieldId === 'genre')?.value;
              const artworkUrlContrib = contrib.contributions.find((c) => c.fieldId === 'artworkUrl')?.value;
              const mbidContrib = contrib.contributions.find((c) => c.fieldId === 'mbid')?.value;

              candidates.push({
                providerId,
                providerName: this.providerRegistry.getDisplayName(providerId),
                externalId: mbidContrib ? String(mbidContrib) : providerId,
                title: String(titleContrib ?? title),
                artist: String(artistContrib ?? artist ?? ''),
                score: contrib.confidenceScore,
                matchedAttributes: {
                  title: String(titleContrib ?? ''),
                  artist: String(artistContrib ?? ''),
                  album: String(albumContrib ?? ''),
                  genre: String(genreContrib ?? ''),
                  artworkUrl: String(artworkUrlContrib ?? ''),
                  mbid: String(mbidContrib ?? '')
                }
              });
              continue;
            }
          } catch (_err) {
            // Fall back to legacy fetchMetadata if contribution lookup fails
          }
        }

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
