import type { IdentityMatchResult } from '../../metadata/identity/TrackIdentityMatcher';

export interface SpotifyUserDTO {
  id: string;
  display_name: string | null;
  images?: Array<{ url: string; height?: number; width?: number }>;
  email?: string;
  country?: string;
  product?: string;
}

export interface SpotifyUserProfile {
  id: string;
  displayName: string | null;
  email?: string;
  product?: string;
  imageUrl?: string;
}

export interface SpotifyTrackInput {
  id?: string;
  uri?: string;
  name: string;
  duration_ms?: number;
  external_ids?: { isrc?: string; ean?: string; upc?: string };
  artists?: Array<{ name: string; id?: string }>;
  album?: {
    name?: string;
    release_date?: string;
    images?: Array<{ url: string; height?: number; width?: number }>;
  };
  recordingVariant?: 'STUDIO' | 'LIVE' | 'ACOUSTIC' | 'REMIX' | 'INSTRUMENTAL' | 'DELUXE' | 'RADIO_EDIT' | 'DEMO' | 'EXTENDED';
  type?: 'track';
  is_local?: boolean;
}

export interface SpotifyEpisodeInput {
  id?: string;
  name: string;
  duration_ms?: number;
  type: 'episode';
  description?: string;
  release_date?: string;
}

export type SpotifyItemPayload = SpotifyTrackInput | SpotifyEpisodeInput | { id?: string; name?: string; type?: string; [key: string]: unknown };

export interface SpotifyPlaylistItemDTO {
  added_at?: string | null;
  is_local?: boolean;
  item: SpotifyItemPayload | null;
}

export interface SpotifyPlaylistItemsResponse {
  href: string;
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
  items: SpotifyPlaylistItemDTO[];
}

export interface SpotifyPlaylistDetails {
  id: string;
  name: string;
  description?: string | null;
  images?: Array<{ url: string; height?: number; width?: number }>;
  tracks?: { total: number };
  items?: { total: number };
  snapshot_id?: string;
  snapshotId?: string;
  uri?: string;
  imageUrl?: string;
  owner?: { id: string; display_name?: string };
  tracksTotal?: number;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string;
  tracksTotal: number;
  snapshotId?: string;
  uri?: string;
  owner?: { id: string; display_name?: string };
  ownerName?: string;
}

export interface SpotifyPlaylistPaging {
  items: SpotifyPlaylistDetails[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

export type SpotifyPlaylistsResponse = SpotifyPlaylistPaging;

// ==========================================
// Phase 3A Export DTOs & Models
// ==========================================

export interface SpotifySearchResponse {
  tracks?: {
    href: string;
    items: SpotifyTrackInput[];
    limit: number;
    next: string | null;
    offset: number;
    previous: string | null;
    total: number;
  };
}

export interface SpotifyCreatePlaylistRequest {
  name: string;
  description?: string;
  public: boolean;
}

export interface SpotifyAddItemsResponse {
  snapshot_id: string;
}

export type CatalogResolutionStatus =
  | 'MATCHED'
  | 'NOT_IN_CATALOG'
  | 'VARIANT_CONFLICT'
  | 'NO_CONFIDENT_MATCH'
  | 'SEARCH_FAILED';

export interface CatalogResolution {
  entryId?: number;
  songId: number;
  status: CatalogResolutionStatus;
  spotifyUri?: string;
  spotifyTrackName?: string;
  spotifyArtistName?: string;
  matchResult?: IdentityMatchResult;
  diagnostics: string[];
}

export type ExportDecision = 'EXPORT' | 'SKIP_NOT_IN_CATALOG' | 'SKIP_VARIANT_CONFLICT' | 'SKIP_SEARCH_FAILED';

export interface SpotifyExportPlanEntry {
  position: number;
  songId: number;
  title: string;
  artists: string[];
  durationSecs: number;
  decision: ExportDecision;
  resolution: CatalogResolution;
  notes: string[];
}

export interface SpotifyExportStatistics {
  totalEntries: number;
  exportableEntries: number;
  unmatchedEntries: number;
  variantConflictEntries: number;
  searchFailedEntries: number;
  plannedExportPercentage: number;
}

export interface SpotifyPlaylistExportPlan {
  playlistId: number;
  playlistName: string;
  description?: string;
  revision: string;
  entries: SpotifyExportPlanEntry[];
  statistics: SpotifyExportStatistics;
  sourceFormat: 'nora';
  targetProvider: 'spotify';
}

export interface SpotifyExportResult {
  status: 'SUCCESS' | 'PARTIAL_FAILURE';
  playlistId: string;
  playlistUrl: string;
  snapshotId: string;
  totalBatches: number;
  completedBatches: number;
  failedBatchIndex?: number;
  error?: string;
}
