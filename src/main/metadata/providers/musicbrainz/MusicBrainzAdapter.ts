import type { IMetadataProviderAdapter } from '@main/metadata/contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '@main/metadata/contracts/ProviderCapabilities';
import type { ProviderIdentity } from '@main/metadata/contracts/ProviderIdentity';
import type { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MetadataMatcher } from './MetadataMatcher';
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
        return this.recordingMapper.toProviderResult(recording) as ProviderResult<TDTO>;
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

    const bestMatch = this.matcher.findBestMatch(
      {
        title: (identity as any).fields?.title ?? rawId,
        artist: (identity as any).fields?.artist,
        durationSeconds: (identity as any).fields?.duration
      },
      candidates
    );

    const recordingToMap = bestMatch ?? candidates[0];
    return this.recordingMapper.toProviderResult(recordingToMap) as ProviderResult<TDTO>;
  }

  public async search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]> {
    const limit = (options?.limit as number) ?? 10;
    const candidates = await this.apiClient.searchRecordings(query, limit);
    return candidates.map((c) => this.recordingMapper.toProviderResult(c) as ProviderResult<TDTO>);
  }

  private isMbid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  private buildSearchQuery(identity: MetadataIdentity): string {
    const fields = (identity as any).fields ?? {};
    const title = fields.title ?? (typeof identity.entityId === 'string' ? identity.entityId : '');
    const artist = fields.artist ?? fields.artists?.[0];

    if (title && artist) {
      return `recording:"${title}" AND artist:"${artist}"`;
    }
    if (title) {
      return `recording:"${title}"`;
    }
    return '';
  }
}
