import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import type { ProviderCapabilities } from '../../contracts/ProviderCapabilities';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderResult } from '../../models/ProviderResult';
import type { AlbumMetadata, ResolvedAlbumRelease } from '../../models/RecordingMetadata';
import type { MetadataContribution, FieldContribution } from '../../domain/MetadataContribution';
import type { ProviderRegistry } from '../../resolution/ProviderRegistry';
import type { CaaApiClient } from './CaaApiClient';

export interface CaaAdapterOptions {
  registry?: ProviderRegistry;
  cache?: {
    get<T>(providerId: string, key: string): T | null;
    set<T>(providerId: string, key: string, val: T, ttlMs?: number): void;
  };
}

export class CoverArtArchiveAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'coverartarchive',
    displayName: 'Cover Art Archive',
    version: '1.0.0'
  };

  public readonly capabilities: ProviderCapabilities = {
    supportsAlbumSearch: false,
    supportsTrackSearch: false,
    supportsArtistSearch: false,
    supportsCoverArt: true,
    supportsHighResArtwork: true,
    supportsGenres: false,
    supportsISRC: false
  };

  public readonly priority = 850;

  private readonly apiClient: CaaApiClient;
  private readonly registry?: ProviderRegistry;
  private readonly cache?: CaaAdapterOptions['cache'];

  constructor(apiClient: CaaApiClient, options?: CaaAdapterOptions) {
    this.apiClient = apiClient;
    this.registry = options?.registry;
    this.cache = options?.cache;
  }

  public supports(capability: keyof ProviderCapabilities): boolean {
    return Boolean(this.capabilities[capability]);
  }

  private getConfidence(fieldId: string, fallback: number): number {
    return this.registry?.getFieldConfidence(this.identity.id, fieldId, fallback) ?? fallback;
  }

  /**
   * Phase 14G — Cover Art Archive Contribution Adapter
   * Directly returns specialized field contributions: artworkUrl, front, back, thumbnail.
   */
  public async fetchContribution(query: { mbid?: string; releaseId?: string; title?: string; artist?: string }): Promise<MetadataContribution | null> {
    console.log('[CoverArtArchiveAdapter] fetchContribution input query:', query);
    const targetMbid = query.mbid ?? query.releaseId;
    if (!targetMbid) {
      console.log('[CoverArtArchiveAdapter] fetchContribution returning null: Neither mbid nor releaseId provided in query');
      return null;
    }

    const cacheKey = `contribution:${targetMbid}`;
    if (this.cache) {
      const cached = this.cache.get<MetadataContribution>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const data = await this.apiClient.fetchContributionData({ mbid: targetMbid });
    if (!data) {
      console.log(`[CoverArtArchiveAdapter] fetchContribution returning null: fetchContributionData returned null for MBID '${targetMbid}' (likely no cover art uploaded on CAA)`);
      return null;
    }

    const contributions: FieldContribution[] = [];

    if (data.artworkUrl) {
      contributions.push({
        fieldId: 'artworkUrl',
        providerId: this.identity.id,
        value: data.artworkUrl,
        confidenceScore: this.getConfidence('artworkUrl', 0.95)
      });
    }

    if (data.front) {
      contributions.push({
        fieldId: 'front',
        providerId: this.identity.id,
        value: data.front,
        confidenceScore: this.getConfidence('front', 0.95)
      });
    }

    if (data.back) {
      contributions.push({
        fieldId: 'back',
        providerId: this.identity.id,
        value: data.back,
        confidenceScore: this.getConfidence('back', 0.90)
      });
    }

    if (data.thumbnail) {
      contributions.push({
        fieldId: 'thumbnail',
        providerId: this.identity.id,
        value: data.thumbnail,
        confidenceScore: this.getConfidence('thumbnail', 0.90)
      });
    }

    if (contributions.length === 0) return null;

    const result: MetadataContribution = {
      providerId: this.identity.id,
      contributions,
      fetchedAt: Date.now()
    };

    if (this.cache) {
      this.cache.set(this.identity.id, cacheKey, result);
    }

    return result;
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const mbid = String(identity.entityId);
    const data = await this.apiClient.fetchContributionData({ mbid });

    if (data && data.artworkUrl) {
      return {
        providerId: this.identity.id,
        entityId: mbid,
        matchConfidence: 0.95,
        metadata: {
          coverArtUrl: data.artworkUrl,
          front: data.front,
          back: data.back,
          thumbnail: data.thumbnail
        } as TDTO
      };
    }

    return {
      providerId: this.identity.id,
      entityId: mbid,
      matchConfidence: 0.0,
      metadata: null as TDTO,
      error: 'Cover art not found in CAA'
    };
  }

  public async search<TDTO = unknown>(_query: string): Promise<ProviderResult<TDTO>[]> {
    return [];
  }
}
