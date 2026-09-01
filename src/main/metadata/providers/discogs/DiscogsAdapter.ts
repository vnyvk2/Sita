import type { MetadataSearchOptions } from '../../../../common/metadata/api';
import type { IdentityResolutionCache } from '../../cache/IdentityResolutionCache';
import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataContribution } from '../../domain/MetadataContribution';
import { MetadataConfidence } from '../../models/MetadataConfidence';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import { MetadataProviderInfo } from '../../models/MetadataProviderInfo';
import { ProviderResult } from '../../models/ProviderResult';
import type {
  AlbumMetadata,
  ResolvedAlbumRelease,
  OfficialTrackInput
} from '../../models/RecordingMetadata';
import type { FieldContribution } from '../../resolution/MetadataMergeEngine';
import type { ProviderRegistry } from '../../resolution/ProviderRegistry';
import { MetadataQueryNormalizer } from '../../search/MetadataQueryNormalizer';
import {
  MetadataSearchRankingEngine,
  type SearchCandidate
} from '../../search/MetadataSearchRankingEngine';
import type { DiscogsApiClient } from './DiscogsApiClient';

export interface DiscogsAdapterOptions {
  registry?: ProviderRegistry;
  cache?: IdentityResolutionCache;
}

export class DiscogsAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'discogs',
    name: 'Discogs',
    version: '1.0.0',
    providerType: 'online'
  };

  public readonly capabilities: ProviderCapabilities = new ProviderCapabilities([
    ProviderCapability.Search,
    ProviderCapability.Artwork,
    ProviderCapability.Tags,
    ProviderCapability.Lookup
  ]);

  public readonly priority = 800;

  private readonly apiClient: DiscogsApiClient;
  private readonly registry?: ProviderRegistry;
  private readonly cache?: IdentityResolutionCache;

  constructor(apiClient: DiscogsApiClient, options?: DiscogsAdapterOptions) {
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

  /**
   * Phase 14F — Discogs Contribution Adapter Directly returns specialized field contributions:
   * genre, style, catalogNumber, masterRelease.
   */
  public async fetchContribution(query: {
    title?: string;
    artist?: string;
  }): Promise<MetadataContribution | null> {
    if (!query.title && !query.artist) return null;

    const cacheKey = `discogs:${query.title ?? ''}:${query.artist ?? ''}`;
    if (this.cache) {
      const cached = this.cache.get<MetadataContribution>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const data = await this.apiClient.fetchContributionData(query);
    if (!data) return null;

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
      providerName: this.identity.name,
      confidenceScore: 0.85,
      contributions
    };

    if (this.cache) {
      this.cache.set(this.identity.id, cacheKey, result);
    }

    return result;
  }

  public async searchAlbums(
    album: string,
    artist?: string,
    options?: MetadataSearchOptions | number,
    targetTrackCountOrSignal?: number | AbortSignal,
    signalParam?: AbortSignal
  ): Promise<AlbumMetadata[]> {
    if (!album) return [];

    let limit = 10;
    let targetTrackCount: number | undefined;
    let signal: AbortSignal | undefined;

    if (typeof options === 'object' && options !== null) {
      limit = options.limit ?? 10;
      targetTrackCount = options.targetTrackCount;
      signal =
        targetTrackCountOrSignal instanceof AbortSignal ? targetTrackCountOrSignal : signalParam;
    } else if (typeof options === 'number') {
      limit = options;
      if (typeof targetTrackCountOrSignal === 'number') {
        targetTrackCount = targetTrackCountOrSignal;
      }
      signal = signalParam;
    }

    const cacheKey = `album_search:${album}:${artist ?? ''}:${limit}:${targetTrackCount ?? 0}`;
    if (this.cache) {
      const cached = this.cache.get<AlbumMetadata[]>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const qStr = [album, artist].filter(Boolean).join(' ');
    const releases = await this.apiClient.searchReleases(qStr, Math.max(limit * 2, 20), signal);

    const normQuery = MetadataQueryNormalizer.normalize(album, artist);

    const candidates: { candidate: SearchCandidate; raw: (typeof releases)[0] }[] = releases.map(
      (rel) => {
        const parts = rel.title.split(' - ');
        const relArtist = parts.length > 1 ? parts[0].trim() : (artist ?? 'Unknown Artist');
        const relTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rel.title;
        const parsedYear = rel.year ? parseInt(rel.year, 10) : undefined;
        const formats = rel.format ?? [];
        const isAlbum = formats.some(
          (f) =>
            f.toLowerCase().includes('album') ||
            f.toLowerCase().includes('lp') ||
            f.toLowerCase().includes('cd')
        );
        const isEP = formats.some(
          (f) => f.toLowerCase().includes('ep') || f.toLowerCase().includes('mini-album')
        );

        return {
          candidate: {
            id: String(rel.id),
            title: relTitle,
            artist: relArtist,
            year: parsedYear,
            status: 'Official',
            primaryType: isAlbum ? 'Album' : isEP ? 'EP' : undefined,
            baseScore: 80,
            rawItem: rel
          },
          raw: rel
        };
      }
    );

    const ranked = MetadataSearchRankingEngine.rankCandidates(
      candidates.map((c) => c.candidate),
      normQuery,
      targetTrackCount
    );

    const candidateMap = new Map<string, (typeof releases)[0]>();
    candidates.forEach((c) => candidateMap.set(c.candidate.id, c.raw));

    const results: AlbumMetadata[] = ranked.slice(0, limit).map((scored) => {
      const rel = candidateMap.get(scored.candidate.id)!;
      const parts = rel.title.split(' - ');
      const relArtist = parts.length > 1 ? parts[0].trim() : (artist ?? 'Unknown Artist');
      const relTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : rel.title;

      return {
        releaseId: String(rel.id),
        title: relTitle,
        artist: relArtist,
        year: rel.year ? parseInt(rel.year, 10) : undefined,
        provider: 'discogs',
        rankingScore: Math.round(scored.totalScore),
        artwork:
          (rel.cover_image ?? rel.thumb)
            ? { onlineUrls: [rel.cover_image ?? rel.thumb!] }
            : undefined
      };
    });

    if (this.cache) {
      this.cache.set(this.identity.id, cacheKey, results);
    }

    return results;
  }

  public async resolveRelease(providerReleaseId: string): Promise<ResolvedAlbumRelease | null> {
    if (!providerReleaseId) return null;

    const details = await this.apiClient.getReleaseById(providerReleaseId);
    if (!details) return null;

    const primaryArtist = details.artists?.[0]?.name ?? 'Unknown Artist';
    const coverArt =
      details.images?.find((img) => img.type === 'primary')?.uri ?? details.images?.[0]?.uri;

    const tracks: OfficialTrackInput[] = (details.tracklist ?? []).map((tr, idx) => ({
      title: tr.title,
      trackNumber: idx + 1,
      duration: tr.duration ? this.parseDuration(tr.duration) : undefined,
      artist: primaryArtist
    }));

    const album: AlbumMetadata = {
      title: details.title,
      artist: primaryArtist,
      year: details.year,
      label: details.labels?.[0]?.name,
      releaseId: String(details.id),
      provider: 'discogs',
      artwork: coverArt ? { onlineUrls: [coverArt] } : undefined
    };

    return {
      album,
      tracks,
      provider: 'discogs',
      providerReleaseId: String(details.id)
    };
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const rawId = String(identity.entityId);
    const details = await this.apiClient.getReleaseById(rawId);

    const info = new MetadataProviderInfo({
      id: this.identity.id,
      displayName: this.identity.name,
      version: this.identity.version
    });

    if (details) {
      const primaryArtist = details.artists?.[0]?.name ?? 'Unknown Artist';
      return new ProviderResult<TDTO>({
        payload: {
          title: details.title,
          artist: primaryArtist,
          album: details.title,
          genre: details.genres?.[0],
          year: details.year
        } as TDTO,
        confidence: new MetadataConfidence(0.9),
        providerInfo: info,
        status: 'success'
      });
    }

    return new ProviderResult<TDTO>({
      payload: null,
      confidence: MetadataConfidence.low(),
      providerInfo: info,
      status: 'failed',
      error: 'Discogs release not found'
    });
  }

  public async search<TDTO = unknown>(
    query: string,
    options?: Record<string, unknown>
  ): Promise<ProviderResult<TDTO>[]> {
    const limit = (options?.limit as number) ?? 10;
    const albums = await this.searchAlbums(query, undefined, limit);

    const info = new MetadataProviderInfo({
      id: this.identity.id,
      displayName: this.identity.name,
      version: this.identity.version
    });

    return albums.map(
      (alb) =>
        new ProviderResult<TDTO>({
          payload: alb as TDTO,
          confidence: new MetadataConfidence(0.8),
          providerInfo: info,
          status: 'success'
        })
    );
  }

  private parseDuration(durStr: string): number | undefined {
    const parts = durStr.split(':').map((p) => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return undefined;
  }
}
