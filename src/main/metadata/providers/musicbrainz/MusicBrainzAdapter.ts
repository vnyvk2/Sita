import type { IMetadataProviderAdapter } from '@main/metadata/contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '@main/metadata/contracts/ProviderCapabilities';
import type { ProviderIdentity } from '@main/metadata/contracts/ProviderIdentity';
import { MetadataMatcher } from '@main/metadata/matching/MetadataMatcher';
import type { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MusicBrainzApiClient } from './MusicBrainzApiClient';
import { MusicBrainzArtistMapper, MusicBrainzRecordingMapper, MusicBrainzReleaseMapper } from './mappers';

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
  private readonly recordingMapper = new MusicBrainzRecordingMapper();
  private readonly releaseMapper = new MusicBrainzReleaseMapper();
  private readonly artistMapper = new MusicBrainzArtistMapper();

  constructor(apiClient: MusicBrainzApiClient, matcher?: MetadataMatcher) {
    this.apiClient = apiClient;
    this.matcher = matcher ?? new MetadataMatcher(0.35);
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    const rawId = String(identity.entityId);

    // If identity looks like a UUID (MBID), fetch directly
    if (this.isMbid(rawId)) {
      const recording = await this.apiClient.getRecordingById(rawId);
      if (recording) {
        return this.recordingMapper.toProviderResult(recording, 1.0) as ProviderResult<TDTO>;
      }
    }

    // Otherwise, perform title/artist search query
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

    const matchResult = this.matcher.findBestMatch(
      {
        title: identity.getSearchTitle() ?? rawId,
        artist: identity.getSearchArtist(),
        durationSeconds: identity.getSearchDuration()
      },
      candidates
    );

    const recordingToMap = matchResult?.candidate ?? candidates[0];
    const confidenceScore = matchResult?.score ?? 0.5;

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
