import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { AlbumMetadata, ResolvedAlbumRelease } from '../../models/RecordingMetadata';
import type { MetadataContribution } from '../../domain/MetadataContribution';
import type { FieldContribution } from '../../resolution/MetadataMergeEngine';
import type { ProviderRegistry } from '../../resolution/ProviderRegistry';
import type { IdentityResolutionCache } from '../../cache/IdentityResolutionCache';
import type { CaaApiClient } from './CaaApiClient';

import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import { ProviderResult } from '../../models/ProviderResult';
import { MetadataConfidence } from '../../models/MetadataConfidence';
import { MetadataProviderInfo } from '../../models/MetadataProviderInfo';

export interface CaaAdapterOptions {
  registry?: ProviderRegistry;
  cache?: IdentityResolutionCache;
}

export class CoverArtArchiveAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'coverartarchive',
    name: 'Cover Art Archive',
    version: '1.0.0',
    providerType: 'online'
  };

  public readonly capabilities: ProviderCapabilities = new ProviderCapabilities([
    ProviderCapability.Artwork,
    ProviderCapability.Lookup
  ]);

  public readonly priority = 850;

  private readonly apiClient: CaaApiClient;
  private readonly registry?: ProviderRegistry;
  private readonly cache?: IdentityResolutionCache;

  constructor(apiClient: CaaApiClient, options?: CaaAdapterOptions) {
    this.apiClient = apiClient;
    this.registry = options?.registry;
    this.cache = options?.cache;
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  private getConfidence(fieldId: string, fallback: number): number {
    return this.registry?.getFieldConfidence(this.identity.id, fieldId, fallback) ?? fallback;
  }

  public async searchAlbums(_album: string, _artist?: string, _limit = 10): Promise<AlbumMetadata[]> {
    return [];
  }

  public async resolveRelease(_providerReleaseId: string): Promise<ResolvedAlbumRelease | null> {
    return null;
  }

  /**
   * Phase 14G — Cover Art Archive Contribution Adapter
   * Directly returns specialized field contributions: artworkUrl, front, back, thumbnail.
   */
  public async fetchContribution(query: { mbid?: string; releaseId?: string; title?: string; artist?: string }): Promise<MetadataContribution | null> {
    const targetMbid = query.mbid ?? query.releaseId;
    if (!targetMbid) return null;

    const cacheKey = `caa:mbid:${targetMbid}`;
    if (this.cache) {
      const cached = this.cache.get<MetadataContribution>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const data = await this.apiClient.fetchContributionData({ mbid: targetMbid });
    if (!data) return null;

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
      providerName: this.identity.name,
      confidenceScore: 0.95,
      contributions
    };

    if (this.cache) {
      this.cache.set(this.identity.id, cacheKey, result);
    }

    return result;
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const mbid = String(identity.entityId);
    const data = await this.apiClient.fetchContributionData({ mbid });

    const info = new MetadataProviderInfo({
      id: this.identity.id,
      displayName: this.identity.name,
      version: this.identity.version
    });

    if (data && data.artworkUrl) {
      return new ProviderResult<TDTO>({
        payload: {
          coverArtUrl: data.artworkUrl,
          front: data.front,
          back: data.back,
          thumbnail: data.thumbnail
        } as TDTO,
        confidence: new MetadataConfidence(0.95),
        providerInfo: info,
        status: 'success'
      });
    }

    return new ProviderResult<TDTO>({
      payload: null,
      confidence: MetadataConfidence.low(),
      providerInfo: info,
      status: 'failed',
      error: 'Cover art not found in CAA'
    });
  }

  public async search<TDTO = unknown>(_query: string): Promise<ProviderResult<TDTO>[]> {
    return [];
  }
}
