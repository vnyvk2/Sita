import type { MetadataSearchOptions } from '../../../../common/metadata/api';
import type { IMetadataProviderAdapter } from '@main/metadata/contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '@main/metadata/contracts/ProviderCapabilities';
import type { ProviderIdentity } from '@main/metadata/contracts/ProviderIdentity';
import type { IdentityResolutionCache } from '@main/metadata/cache/IdentityResolutionCache';
import { MetadataMatcher, type CandidateItem } from '@main/metadata/matching';
import type { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import type { AlbumMetadata, ResolvedAlbumRelease } from '@main/metadata/models/RecordingMetadata';
import type { MusicBrainzRecordingDto, MusicBrainzReleaseDto } from './dto';
import { MusicBrainzApiClient } from './MusicBrainzApiClient';
import { MusicBrainzRecordingMapper, MusicBrainzReleaseMapper } from './mappers';
import type { MetadataContribution } from '@main/metadata/domain/MetadataContribution';

import type { ProviderRegistry } from '@main/metadata/resolution/ProviderRegistry';
import type { FieldContribution } from '../../resolution/MetadataMergeEngine';
import { MetadataQueryNormalizer } from '../../search/MetadataQueryNormalizer';
import { MetadataSearchRankingEngine } from '../../search/MetadataSearchRankingEngine';

export interface MusicBrainzAdapterOptions {
  matcher?: MetadataMatcher;
  cache?: IdentityResolutionCache;
  registry?: ProviderRegistry;
  priority?: number;
}

export class MusicBrainzAdapter implements IMetadataProviderAdapter {
  public readonly priority: number;

  public readonly identity: ProviderIdentity = {
    id: 'musicbrainz',
    name: 'MusicBrainz Provider',
    version: '1.0.0',
    providerType: 'online',
    homepage: 'https://musicbrainz.org',
    description: 'Fetches open music metadata, release info, and tags from MusicBrainz API'
  };

  public readonly capabilities: ProviderCapabilities = new ProviderCapabilities([
    ProviderCapability.Lookup,
    ProviderCapability.Search,
    ProviderCapability.Enrichment,
    ProviderCapability.Relationships,
    ProviderCapability.Tags
  ]);

  private readonly apiClient: MusicBrainzApiClient;
  private readonly matcher: MetadataMatcher;
  private readonly cache?: IdentityResolutionCache;
  private readonly registry?: ProviderRegistry;
  private readonly recordingMapper = new MusicBrainzRecordingMapper();
  private readonly releaseMapper = new MusicBrainzReleaseMapper();

  constructor(apiClient: MusicBrainzApiClient, options?: MusicBrainzAdapterOptions) {
    this.apiClient = apiClient;
    this.priority = options?.priority ?? 100;
    this.matcher = options?.matcher ?? new MetadataMatcher(0.35);
    this.cache = options?.cache;
    this.registry = options?.registry;
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  private getConfidence(fieldId: string, fallback: number): number {
    return this.registry?.getFieldConfidence(this.identity.id, fieldId, fallback) ?? fallback;
  }

  public async fetchContribution(query: { title?: string; artist?: string; mbid?: string; releaseId?: string }): Promise<MetadataContribution | null> {
    console.log('[MusicBrainzAdapter] fetchContribution input query:', query);
    const targetMbid = query.mbid ?? query.releaseId;

    if (query.title) {
      // Direct canonical contribution when title/artist are supplied from the resolved release
      const contributions: FieldContribution[] = [
        { fieldId: 'title', providerId: 'musicbrainz', value: query.title, confidenceScore: this.getConfidence('title', 0.95) }
      ];

      if (query.artist) {
        contributions.push({ fieldId: 'artist', providerId: 'musicbrainz', value: query.artist, confidenceScore: this.getConfidence('artist', 0.95) });
      }

      if (targetMbid) {
        contributions.push({ fieldId: 'mbid', providerId: 'musicbrainz', value: targetMbid, confidenceScore: this.getConfidence('mbid', 0.99) });
      }

      return {
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95,
        contributions
      };
    }

    if (!targetMbid) {
      console.log('[MusicBrainzAdapter] fetchContribution returning null: No title or mbid provided in query');
      return null;
    }

    const mbRelease = await this.apiClient.getReleaseById(targetMbid);
    if (!mbRelease) {
      console.log('[MusicBrainzAdapter] fetchContribution returning null: getReleaseById returned null for MBID', targetMbid);
      return null;
    }

    const artistName = mbRelease['artist-credit']?.[0]?.name ?? query.artist ?? '';

    return {
      providerId: 'musicbrainz',
      providerName: 'MusicBrainz',
      confidenceScore: 0.95,
      contributions: [
        { fieldId: 'title', providerId: 'musicbrainz', value: mbRelease.title, confidenceScore: this.getConfidence('title', 0.95) },
        { fieldId: 'artist', providerId: 'musicbrainz', value: artistName, confidenceScore: this.getConfidence('artist', 0.95) },
        { fieldId: 'album', providerId: 'musicbrainz', value: mbRelease.title, confidenceScore: this.getConfidence('album', 0.90) },
        { fieldId: 'mbid', providerId: 'musicbrainz', value: targetMbid, confidenceScore: this.getConfidence('mbid', 0.99) }
      ]
    };
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
      signal = targetTrackCountOrSignal instanceof AbortSignal ? targetTrackCountOrSignal : signalParam;
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

    const SEARCH_BUFFER = 25;
    const normQuery = MetadataQueryNormalizer.normalize(album, artist);

    // Use cleanTitle for Lucene query to handle editions like "Deluxe", "Remastered", etc.
    // MusicBrainz indexes the base release title, so searching with edition suffixes
    // often produces poor or no results.
    const searchTitle = normQuery.cleanTitle || album;
    const queryParts: string[] = [`release:"${searchTitle}"`];
    if (normQuery.cleanArtist) {
      queryParts.push(`artist:"${normQuery.cleanArtist}"`);
    }

    let rawReleases = await this.apiClient.searchReleases(queryParts.join(' AND '), SEARCH_BUFFER, signal);

    // Fallback: if clean title search returned nothing and we stripped edition info,
    // retry with the original raw title
    if (rawReleases.length === 0 && searchTitle !== album) {
      const fallbackParts: string[] = [`release:"${album}"`];
      if (normQuery.cleanArtist) {
        fallbackParts.push(`artist:"${normQuery.cleanArtist}"`);
      }
      rawReleases = await this.apiClient.searchReleases(fallbackParts.join(' AND '), SEARCH_BUFFER, signal);
    }

    const searchCandidates = rawReleases.map((rel) => ({
      id: rel.id,
      title: rel.title,
      artist: rel['artist-credit']?.[0]?.name ?? rel['artist-credit']?.[0]?.artist?.name,
      year: rel.date ? Number(rel.date.substring(0, 4)) : undefined,
      status: rel.status,
      primaryType: rel['release-group']?.['primary-type'],
      secondaryTypes: rel['release-group']?.['secondary-types'],
      trackCount:
        rel['track-count'] ??
        (rel.media && rel.media.length > 0
          ? rel.media.reduce((sum, m) => sum + (m['track-count'] ?? 0), 0)
          : undefined),
      baseScore: typeof rel.score === 'number' ? rel.score : Number(rel.score ?? 50),
      rawItem: rel
    }));

    const rankedCandidates = MetadataSearchRankingEngine.rankCandidates(searchCandidates, normQuery, targetTrackCount);
    const results: AlbumMetadata[] = rankedCandidates.slice(0, limit).map((scored) => ({
      ...this.releaseMapper.toAlbumMetadata(scored.candidate.rawItem as MusicBrainzReleaseDto, artist),
      rankingScore: Math.round(scored.totalScore)
    }));

    if (this.cache && results.length > 0) {
      this.cache.set(this.identity.id, cacheKey, results);
    }

    return results;
  }

  public async resolveRelease(providerReleaseId: string): Promise<ResolvedAlbumRelease | null> {
    if (!providerReleaseId) return null;

    const cacheKey = `release_details:${providerReleaseId}`;
    if (this.cache) {
      const cached = this.cache.get<ResolvedAlbumRelease>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const rel = await this.apiClient.getReleaseById(providerReleaseId);
    if (!rel) return null;

    const resolved = this.releaseMapper.toResolvedAlbumRelease(rel);

    if (this.cache) {
      this.cache.set(this.identity.id, cacheKey, resolved);
    }

    return resolved;
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const rawId = String(identity.entityId);

    // 1. Direct MBID lookup
    if (this.isMbid(rawId)) {
      const recording = await this.apiClient.getRecordingById(rawId);
      if (recording) {
        return this.recordingMapper.toProviderResult(recording, 1.0) as ProviderResult<TDTO>;
      }
    }

    const title = identity.getSearchTitle();
    const artist = identity.getSearchArtist();
    const cacheKey = title && artist ? `${title}:${artist}` : null;

    // 2. Identity Resolution Cache lookup
    if (this.cache && cacheKey) {
      const cachedMbid = this.cache.get<string>(this.identity.id, cacheKey);
      if (cachedMbid) {
        const cachedRecording = await this.apiClient.getRecordingById(cachedMbid);
        if (cachedRecording) {
          return this.recordingMapper.toProviderResult(cachedRecording, 1.0) as ProviderResult<TDTO>;
        }
      }
    }

    // 3. Search query lookup
    const searchQuery = this.buildSearchQuery(identity);
    const info = new MetadataProviderInfo({
      id: this.identity.id,
      displayName: this.identity.name,
      version: this.identity.version
    });

    if (!searchQuery) {
      return new ProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: info,
        status: 'failed'
      });
    }

    const candidates = await this.apiClient.searchRecordings(searchQuery, 10);
    if (candidates.length === 0) {
      return new ProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: info,
        status: 'failed'
      });
    }

    // Adapt MusicBrainz DTOs to provider-generic CandidateItems
    const adaptedCandidates: Array<CandidateItem & { original: MusicBrainzRecordingDto }> = candidates.map((c) => ({
      id: c.id,
      title: c.title,
      artists: c['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean),
      durationSeconds: c.length ? c.length / 1000 : undefined,
      original: c
    }));

    const matchResult = this.matcher.findBestMatch(
      {
        title: title ?? rawId,
        artist,
        durationSeconds: identity.getSearchDuration()
      },
      adaptedCandidates
    );

    const recordingToMap = matchResult?.candidate.original ?? candidates[0];
    const confidenceScore = matchResult?.score ?? 0.5;

    // 4. Cache resolved MBID on high-confidence match
    if (this.cache && cacheKey && matchResult && confidenceScore >= 0.5) {
      this.cache.set(this.identity.id, cacheKey, matchResult.candidate.id);
    }

    return this.recordingMapper.toProviderResult(recordingToMap, confidenceScore) as ProviderResult<TDTO>;
  }

  public async searchRecordings(title: string, artist?: string, limit = 10): Promise<Array<{ id: string; title: string; artist?: string; album?: string; year?: number; confidenceScore?: number }>> {
    const query = artist ? `recording:"${title}" AND artist:"${artist}"` : `recording:"${title}"`;
    const recordings = await this.apiClient.searchRecordings(query, limit);

    return recordings.map((r) => ({
      id: r.id,
      title: r.title,
      artist: r['artist-credit']?.[0]?.name ?? r['artist-credit']?.[0]?.artist?.name,
      album: r.releases?.[0]?.title,
      year: r.releases?.[0]?.date ? parseInt(r.releases[0].date.substring(0, 4), 10) : undefined,
      confidenceScore: typeof r.score === 'number' ? r.score / 100 : 0.8
    }));
  }

  public async resolveRecording(recordingId: string): Promise<{ id: string; title: string; artist?: string; trackNumber?: number } | null> {
    if (!recordingId) return null;
    const details = await this.apiClient.getRecordingById(recordingId);
    if (!details) return null;

    return {
      id: details.id,
      title: details.title,
      artist: details['artist-credit']?.[0]?.name ?? details['artist-credit']?.[0]?.artist?.name
    };
  }

  public async search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]> {
    const limit = (options?.limit as number) ?? 10;
    const candidates = await this.apiClient.searchRecordings(query, limit);
    return candidates.map((c) => this.recordingMapper.toProviderResult(c, 0.8) as ProviderResult<TDTO>);
  }

  private isMbid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  private buildSearchQuery(identity: MetadataIdentity): string {
    const title = identity.getSearchTitle() ?? (typeof identity.entityId === 'string' ? identity.entityId : '');
    const artist = identity.getSearchArtist();

    if (title && artist) {
      return `recording:"${title}" AND artist:"${artist}"`;
    }
    if (title) {
      return `recording:"${title}"`;
    }
    return '';
  }
}
