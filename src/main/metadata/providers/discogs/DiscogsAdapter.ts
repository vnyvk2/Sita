import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import type { ProviderCapabilities } from '../../contracts/ProviderCapabilities';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderResult } from '../../models/ProviderResult';
import type { AlbumMetadata, ResolvedAlbumRelease } from '../../models/RecordingMetadata';
import type { MetadataContribution, FieldContribution } from '../../domain/MetadataContribution';
import type { DiscogsApiClient } from './DiscogsApiClient';

import type { ProviderRegistry } from '../../resolution/ProviderRegistry';

export interface DiscogsAdapterOptions {
  registry?: ProviderRegistry;
  cache?: {
    get<T>(providerId: string, key: string): T | null;
    set<T>(providerId: string, key: string, val: T, ttlMs?: number): void;
  };
}

export class DiscogsAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'discogs',
    displayName: 'Discogs',
    version: '1.0.0'
  };

  public readonly capabilities: ProviderCapabilities = {
    supportsAlbumSearch: true,
    supportsTrackSearch: true,
    supportsArtistSearch: true,
    supportsCoverArt: true,
    supportsHighResArtwork: true,
    supportsGenres: true,
    supportsISRC: false
  };

  public readonly priority = 800;

  private readonly apiClient: DiscogsApiClient;
  private readonly registry?: ProviderRegistry;
  private readonly cache?: DiscogsAdapterOptions['cache'];

  constructor(apiClient: DiscogsApiClient, options?: DiscogsAdapterOptions) {
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
   * Phase 14F — Discogs Contribution Adapter
   * Directly returns specialized field contributions: genre, style, catalogNumber, masterRelease.
   */
  public async fetchContribution(query: { title?: string; artist?: string; mbid?: string; releaseId?: string }): Promise<MetadataContribution | null> {
    console.log('[DiscogsAdapter] fetchContribution input query:', query);
    if (!query.title && !query.artist) {
      console.log('[DiscogsAdapter] fetchContribution returning null: Neither title nor artist provided');
      return null;
    }

    const cacheKey = `contribution:${query.title ?? ''}:${query.artist ?? ''}`;
    if (this.cache) {
      const cached = this.cache.get<MetadataContribution>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const data = await this.apiClient.fetchContributionData(query);
    if (!data) {
      console.log('[DiscogsAdapter] fetchContribution returning null: fetchContributionData returned null for query', query);
      return null;
    }

    const contributions: FieldContribution[] = [];

    if (data.genre) {
      contributions.push({
        fieldId: 'genre',
        providerId: this.identity.id,
        value: data.genre,
        confidenceScore: this.getConfidence('genre', 0.85)
      });
    }

    if (data.style) {
      contributions.push({
        fieldId: 'style',
        providerId: this.identity.id,
        value: data.style,
        confidenceScore: this.getConfidence('style', 0.85)
      });
    }

    if (data.catalogNumber) {
      contributions.push({
        fieldId: 'catalogNumber',
        providerId: this.identity.id,
        value: data.catalogNumber,
        confidenceScore: this.getConfidence('catalogNumber', 0.9)
      });
    }

    if (data.masterRelease) {
      contributions.push({
        fieldId: 'masterRelease',
        providerId: this.identity.id,
        value: data.masterRelease,
        confidenceScore: this.getConfidence('masterRelease', 0.95)
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

  public async searchAlbums(album: string, artist?: string, limit = 10): Promise<AlbumMetadata[]> {
    const qStr = [album, artist].filter(Boolean).join(' ');
    if (!qStr) return [];

    const releases = await this.apiClient.searchReleases(qStr, limit);

    return releases.map((rel) => {
      const parts = rel.title.split(' - ');
      const relArtist = parts.length > 1 ? parts[0].trim() : artist ?? 'Unknown Artist';
      const relTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rel.title;

      return {
        id: String(rel.id),
        releaseId: String(rel.id),
        title: relTitle,
        artist: relArtist,
        album: relTitle,
        year: rel.year ? parseInt(rel.year, 10) : undefined,
        genre: rel.genre?.[0],
        coverArtUrl: rel.cover_image ?? rel.thumb,
        provider: this.identity.id,
        confidenceScore: 0.8
      };
    });
  }

  public async resolveRelease(providerReleaseId: string): Promise<ResolvedAlbumRelease | null> {
    if (!providerReleaseId) return null;

    const details = await this.apiClient.getReleaseById(providerReleaseId);
    if (!details) return null;

    const primaryArtist = details.artists?.[0]?.name ?? 'Unknown Artist';
    const coverArt = details.images?.find((img) => img.type === 'primary')?.uri ?? details.images?.[0]?.uri;

    const tracks = (details.tracklist ?? []).map((tr, idx) => ({
      recordingId: `discogs-tr-${details.id}-${idx + 1}`,
      title: tr.title,
      trackNumber: idx + 1,
      duration: tr.duration ? this.parseDuration(tr.duration) : undefined,
      artist: primaryArtist,
      isrc: undefined
    }));

    return {
      releaseId: String(details.id),
      title: details.title,
      artist: primaryArtist,
      year: details.year,
      genre: details.genres?.[0],
      coverArtUrl: coverArt,
      provider: this.identity.id,
      tracks
    };
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const rawId = String(identity.entityId);
    const details = await this.apiClient.getReleaseById(rawId);

    if (details) {
      const primaryArtist = details.artists?.[0]?.name ?? 'Unknown Artist';
      return {
        providerId: this.identity.id,
        entityId: String(details.id),
        matchConfidence: 0.9,
        metadata: {
          title: details.title,
          artist: primaryArtist,
          album: details.title,
          genre: details.genres?.[0],
          year: details.year
        } as TDTO
      };
    }

    return {
      providerId: this.identity.id,
      entityId: rawId,
      matchConfidence: 0.0,
      metadata: null as TDTO,
      error: 'Discogs release not found'
    };
  }

  public async search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]> {
    const limit = (options?.limit as number) ?? 10;
    const albums = await this.searchAlbums(query, undefined, limit);

    return albums.map((alb) => ({
      providerId: this.identity.id,
      entityId: alb.id,
      matchConfidence: alb.confidenceScore ?? 0.8,
      metadata: alb as TDTO
    }));
  }

  private parseDuration(durStr: string): number | undefined {
    const parts = durStr.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return undefined;
  }
}
