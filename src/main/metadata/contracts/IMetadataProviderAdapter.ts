import type { AlbumMetadata, ResolvedAlbumRelease } from '../models/RecordingMetadata';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderResult } from '../models/ProviderResult';
import type { ProviderCapabilities, ProviderCapability } from './ProviderCapabilities';
import type { ProviderConfiguration } from './ProviderConfiguration';
import type { ProviderIdentity } from './ProviderIdentity';
import type { MetadataContribution } from '../domain/MetadataContribution';

export interface IProviderLifecycle {
  initialize?(config?: ProviderConfiguration): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface IMetadataProviderAdapter {
  readonly identity: ProviderIdentity;
  readonly capabilities: ProviderCapabilities;
  readonly priority?: number;

  supports(capability: ProviderCapability): boolean;

  lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>>;
  search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]>;

  /**
   * Structured album search returning domain AlbumMetadata[].
   */
  searchAlbums?(album: string, artist?: string, limit?: number, targetTrackCount?: number): Promise<AlbumMetadata[]>;

  /**
   * Resolves release details and official track listing into ResolvedAlbumRelease domain model.
   */
  resolveRelease?(providerReleaseId: string): Promise<ResolvedAlbumRelease | null>;

  /**
   * Directly fetches specialized field contributions for provider federation.
   */
  fetchContribution?(query: { title?: string; artist?: string; mbid?: string; releaseId?: string; isrc?: string }): Promise<MetadataContribution | null>;
}
