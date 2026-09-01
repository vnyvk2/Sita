import type { ExecutionMode } from './MetadataOperation';
import type { MetadataPolicy } from './MetadataPolicy';
import type { ProviderId } from './MetadataResolution';
import type { MetadataResourceType, MetadataResource } from './MetadataResource';

export interface AlbumLookupQuery {
  albumTitle: string;
  artistName?: string;
  year?: number;
}

export interface TrackLookupQuery {
  trackTitle: string;
  artistName?: string;
  albumTitle?: string;
  isrc?: string;
}

export interface ArtistLookupQuery {
  artistName: string;
}

export type QueryContext = AlbumLookupQuery | TrackLookupQuery | ArtistLookupQuery;

export interface ResourceContext {
  primaryType: MetadataResourceType;
  targetResources: MetadataResource[];
}

export interface ExecutionContext {
  mode: ExecutionMode;
  timeoutMs?: number;
  locale?: string;
}

export interface SelectionContext {
  preferredProviderIds?: ProviderId[];
  userSelections?: Record<string, string | number>;
}

export interface MetadataRequest {
  id: string;
  operationId?: string;
  resourceId?: number | string;
  query: QueryContext;
  selection?: SelectionContext;
  policy?: MetadataPolicy;
  requestedAt: number;
}

export interface MetadataContext {
  resources: ResourceContext;
  execution: ExecutionContext;
  request?: MetadataRequest;
  policy?: MetadataPolicy;
}
