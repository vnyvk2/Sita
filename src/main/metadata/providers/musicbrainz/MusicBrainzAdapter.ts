import type { IMetadataProviderAdapter } from '@main/metadata/contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '@main/metadata/contracts/ProviderCapabilities';
import type { ProviderIdentity } from '@main/metadata/contracts/ProviderIdentity';
import type { IdentityResolutionCache } from '@main/metadata/cache/IdentityResolutionCache';
import { MetadataMatcher, type CandidateItem } from '@main/metadata/matching';
import type { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import type { AlbumMetadata, OfficialTrackInput, ResolvedAlbumRelease } from '@main/metadata/models/RecordingMetadata';
import type { MusicBrainzRecordingDto, MusicBrainzReleaseDto } from './dto';
import { MusicBrainzApiClient } from './MusicBrainzApiClient';
import { MusicBrainzArtistMapper, MusicBrainzRecordingMapper, MusicBrainzReleaseMapper } from './mappers';

export interface MusicBrainzAdapterOptions {
  matcher?: MetadataMatcher;
  cache?: IdentityResolutionCache;
}

export class MusicBrainzAdapter implements IMetadataProviderAdapter {
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
  private readonly recordingMapper = new MusicBrainzRecordingMapper();
  private readonly releaseMapper = new MusicBrainzReleaseMapper();
  private readonly artistMapper = new MusicBrainzArtistMapper();

  constructor(apiClient: MusicBrainzApiClient, options?: MusicBrainzAdapterOptions) {
    this.apiClient = apiClient;
    this.matcher = options?.matcher ?? new MetadataMatcher(0.35);
    this.cache = options?.cache;
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  public async searchAlbums(album: string, artist?: string, limit = 10): Promise<AlbumMetadata[]> {
    if (!album) return [];

    const cacheKey = `album_search:${album}:${artist ?? ''}:${limit}`;
    if (this.cache) {
      const cached = this.cache.get<AlbumMetadata[]>(this.identity.id, cacheKey);
      if (cached) return cached;
    }

    const queryParts: string[] = [`release:"${album}"`];
    if (artist) {
      queryParts.push(`artist:"${artist}"`);
    }

    const releases = await this.apiClient.searchReleases(queryParts.join(' AND '), limit);
    const results: AlbumMetadata[] = releases.map((rel) => {
      const artistName = rel['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean).join(', ') || artist || 'Unknown Artist';
      const year = rel.date ? parseInt(rel.date.substring(0, 4), 10) : undefined;
      const trackCount = rel.media?.reduce((acc, m) => acc + (m['track-count'] ?? m.tracks?.length ?? 0), 0) || undefined;

      return {
        title: rel.title,
        artist: artistName,
        year: isNaN(year!) ? undefined : year,
        label: rel['label-info']?.[0]?.label?.name,
        releaseType: rel['release-group']?.['primary-type'] ?? rel.status,
        discCount: rel.media?.length ?? 1,
        trackCount,
        releaseId: rel.id,
        provider: 'musicbrainz'
      };
    });

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

    const artistName = rel['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean).join(', ') || 'Unknown Artist';
    const year = rel.date ? parseInt(rel.date.substring(0, 4), 10) : undefined;

    const officialTracks: OfficialTrackInput[] = [];

    if (rel.media) {
      for (const media of rel.media) {
        const discNumber = media.position ?? 1;
        if (media.tracks) {
          for (const track of media.tracks) {
            const trackNo = track.position ?? (track.number ? parseInt(track.number, 10) : officialTracks.length + 1);
            const trackArtist = track['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean).join(', ') || artistName;
            const duration = track.length ? track.length / 1000 : track.recording?.length ? track.recording.length / 1000 : undefined;

            officialTracks.push({
              trackId: track.id,
              title: track.title ?? track.recording?.title ?? '',
              artist: trackArtist,
              album: rel.title,
              year: isNaN(year!) ? undefined : year,
              trackNumber: isNaN(trackNo) ? officialTracks.length + 1 : trackNo,
              discNumber,
              duration,
              musicBrainzRecordingId: track.recording?.id
            });
          }
        }
      }
    }

    const album: AlbumMetadata = {
      title: rel.title,
      artist: artistName,
      year: isNaN(year!) ? undefined : year,
      label: rel['label-info']?.[0]?.label?.name,
      releaseType: rel['release-group']?.['primary-type'] ?? rel.status,
      discCount: rel.media?.length ?? 1,
      trackCount: officialTracks.length,
      releaseId: rel.id,
      provider: 'musicbrainz'
    };

    const resolved: ResolvedAlbumRelease = {
      album,
      tracks: officialTracks,
      provider: 'musicbrainz',
      providerReleaseId: rel.id
    };

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
    if (!searchQuery) {
      return new ProviderResult({
        payload: null,
        confidence: 0,
        providerInfo: this.identity
      }) as ProviderResult<TDTO>;
    }

    const candidates = await this.apiClient.searchRecordings(searchQuery, 10);
    if (candidates.length === 0) {
      return new ProviderResult({
        payload: null,
        confidence: 0,
        providerInfo: this.identity
      }) as ProviderResult<TDTO>;
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
