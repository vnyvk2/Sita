import type { MetadataProviderExecutor } from '../providers/MetadataProviderExecutor';
import type { ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataContext, AlbumLookupQuery, TrackLookupQuery } from '../domain/MetadataContext';
import { ProviderRegistry } from './ProviderRegistry';
import type { FieldContribution } from './MetadataMergeEngine';
import type { IMetadataProviderAdapter } from '../contracts/IMetadataProviderAdapter';

export interface ProviderResolutionResult {
  contributions: FieldContribution[];
  candidates: ProviderCandidate[];
  providerMetrics?: Record<string, { durationMs: number; success: boolean }>;
}

export interface MetadataLookupGateway {
  searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]>;
  searchContributions?(context: MetadataContext): Promise<FieldContribution[]>;
  resolveFederated?(context: MetadataContext): Promise<ProviderResolutionResult>;
}

export class DefaultMetadataLookupGateway implements MetadataLookupGateway {
  private readonly providerRegistry: ProviderRegistry;
  private readonly inFlightResolutions = new Map<string, Promise<ProviderResolutionResult>>();

  constructor(_executor?: MetadataProviderExecutor, providerRegistry?: ProviderRegistry) {
    this.providerRegistry = providerRegistry ?? new ProviderRegistry();
  }

  /**
   * Single-pass parallel provider resolution executing fetchContribution across all active providers concurrently (Promise.allSettled).
   * Derives both specialized FieldContribution[] and ProviderCandidate[] in a single network pass.
   * Includes in-flight memoization to prevent duplicate federation passes.
   */
  public async resolveFederated(context: MetadataContext): Promise<ProviderResolutionResult> {
    const requestQuery = context.request?.query;
    if (!requestQuery) return { contributions: [], candidates: [] };

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

    if (!title && !mbid && !releaseId) return { contributions: [], candidates: [] };

    const cacheKey = JSON.stringify({
      title: title ?? '',
      artist: artist ?? '',
      mbid: mbid ?? '',
      releaseId: releaseId ?? ''
    });
    const existing = this.inFlightResolutions.get(cacheKey);
    if (existing) {
      return existing;
    }

    const resolutionPromise = (async (): Promise<ProviderResolutionResult> => {
      const activeInstances = this.providerRegistry.getActiveInstances();
      const query = { title, artist, mbid, releaseId };

      // Parallel execution across all active providers with failure isolation
      const providerEntries = Array.from(activeInstances.entries());
      const tasks = providerEntries.map(async ([providerId, instance]) => {
        const adapter = instance as unknown as IMetadataProviderAdapter;
        const t0 = performance.now();
        if (adapter && typeof adapter.fetchContribution === 'function') {
          try {
            const contrib = await adapter.fetchContribution(query);
            const durationMs = Math.round(performance.now() - t0);
            return { providerId, contrib, durationMs, success: Boolean(contrib) };
          } catch (_err: unknown) {
            const durationMs = Math.round(performance.now() - t0);
            return { providerId, contrib: null, durationMs, success: false };
          }
        }
        return { providerId, contrib: null, durationMs: 0, success: false };
      });

      const settled = await Promise.allSettled(tasks);
      const contributions: FieldContribution[] = [];
      const candidates: ProviderCandidate[] = [];
      const providerMetrics: Record<string, { durationMs: number; success: boolean }> = {};

      for (const res of settled) {
        if (res.status === 'fulfilled' && res.value) {
          const { providerId, contrib, durationMs, success } = res.value;
          providerMetrics[providerId] = { durationMs, success };

          if (contrib && contrib.contributions && contrib.contributions.length > 0) {
            contributions.push(...contrib.contributions);

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
          }
        }
      }

      return { contributions, candidates, providerMetrics };
    })();

    this.inFlightResolutions.set(cacheKey, resolutionPromise);
    try {
      return await resolutionPromise;
    } finally {
      this.inFlightResolutions.delete(cacheKey);
    }
  }

  public async searchContributions(context: MetadataContext): Promise<FieldContribution[]> {
    const result = await this.resolveFederated(context);
    return result.contributions;
  }

  public async searchCandidates(context: MetadataContext): Promise<ProviderCandidate[]> {
    const result = await this.resolveFederated(context);
    return result.candidates;
  }

  public get registry(): ProviderRegistry {
    return this.providerRegistry;
  }
}
