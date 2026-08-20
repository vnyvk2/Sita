import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import type { IdentityMatchResult } from '../../metadata/identity/TrackIdentityMatcher';

export interface SpotifyUserProfile {
  id: string;
  displayName: string | null;
  email?: string;
  product?: string;
  images?: Array<{ url: string }>;
}

export interface SpotifyArtistInput {
  name: string;
}

export interface SpotifyAlbumInput {
  name: string;
  images?: Array<{ url: string; height?: number; width?: number }>;
  release_date?: string;
}

export interface SpotifyExternalIds {
  isrc?: string;
  ean?: string;
  upc?: string;
}

export interface SpotifyTrackInput {
  id?: string;
  uri?: string;
  name: string;
  artists?: SpotifyArtistInput[];
  album?: SpotifyAlbumInput;
  duration_ms?: number;
  track_number?: number;
  disc_number?: number;
  external_ids?: SpotifyExternalIds;
  is_local?: boolean;
  type?: string;
}

export interface SpotifyItemPayload {
  track?: SpotifyTrackInput;
}

export interface SpotifyPlaylistItemDTO {
  added_at?: string;
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
  collaborative?: boolean;
  public?: boolean;
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
  playlists?: SpotifyPlaylistDetails[];
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

export type ExportDecision =
  | 'EXPORT'
  | 'SKIP_NOT_IN_CATALOG'
  | 'SKIP_VARIANT_CONFLICT'
  | 'SKIP_SEARCH_FAILED';

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

// ==========================================
// Phase 3B Two-Way Sync DTOs & Models
// ==========================================

export interface SpotifyRemovePlaylistItem {
  uri: string;
  positions?: number[];
}

export interface SpotifyRemoveItemsResponse {
  snapshot_id: string;
}

export type SyncStrategy = 'UNION_MERGE' | 'LOCAL_WINS' | 'REMOTE_WINS';

export type SyncState = 'SYNCED' | 'SYNCING' | 'PARTIAL_FAILURE' | 'CONFLICT' | 'ERROR';

export type DriftState =
  | 'IN_SYNC'
  | 'LOCAL_AHEAD'
  | 'REMOTE_AHEAD'
  | 'CONFLICT_DIVERGED'
  | 'NEEDS_RECOVERY';

export interface PlaylistOccurrence {
  occurrenceId: string; // e.g. "isrc:USRC17607839#0" or "meta:bohemian rhapsody::queen#0"
  identityKey: string;
  occurrenceIndex: number;
  position: number;
  canonicalTrack: CanonicalTrackIdentity;
  spotifyUri?: string;
  localSongId?: number;
}

export interface SpotifyPlaylistLinkDTO {
  id: number;
  playlistId: number;
  spotifyPlaylistId: string;
  spotifyPlaylistName?: string | null;
  spotifyUserId: string;
  lastSyncedSnapshotId?: string | null;
  lastSyncedEntriesHash?: string | null;
  syncStrategy: SyncStrategy;
  syncState: SyncState;
  failureStage?: 'REMOTE' | 'LOCAL' | 'FINALIZATION' | null;
  completedRemoteBatches?: number | null;
  failedBatchIndex?: number | null;
  lastError?: string | null;
  lastSyncedAt?: string | null;
}

export interface SpotifySyncDriftStatus {
  playlistId: number;
  spotifyPlaylistId: string;
  driftState: DriftState;
  localEntriesHash: string;
  lastSyncedEntriesHash?: string | null;
  currentSnapshotId: string;
  lastSyncedSnapshotId?: string | null;
  localEntriesCount: number;
  remoteItemsCount: number;
  syncState: SyncState;
  lastError?: string | null;
}

export interface SpotifySyncLocalOperation {
  action: 'ADD' | 'REMOVE';
  songId: number;
  position?: number;
  occurrenceId: string;
  title: string;
  artists: string[];
}

export interface SpotifySyncRemoteOperation {
  action: 'ADD' | 'REMOVE';
  spotifyUri: string;
  position?: number;
  occurrenceId: string;
  title: string;
  artists: string[];
}

export interface SpotifySyncStatistics {
  inSyncOccurrences: number;
  localAdditionsCount: number;
  localRemovalsCount: number;
  remoteAdditionsCount: number;
  remoteRemovalsCount: number;
  unresolvedRemoteCount: number;
}

export interface SpotifyPlaylistSyncPlan {
  playlistId: number;
  spotifyPlaylistId: string;
  strategy: SyncStrategy;
  base: {
    localEntriesHash: string;
    remoteSnapshotId: string;
  };
  localTarget: PlaylistOccurrence[];
  remoteTarget: PlaylistOccurrence[];
  localOperations: SpotifySyncLocalOperation[];
  remoteOperations: SpotifySyncRemoteOperation[];
  unresolvedRemoteOccurrences: PlaylistOccurrence[];
  statistics: SpotifySyncStatistics;
  plannedAt: string;
}

export interface SpotifySyncResult {
  status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'ERROR';
  playlistId: number;
  spotifyPlaylistId: string;
  finalSnapshotId?: string;
  finalEntriesHash?: string;
  strategy: SyncStrategy;
  syncState: SyncState;
  failureStage?: 'REMOTE' | 'REMOTE_VERIFICATION' | 'LOCAL' | 'LOCAL_VERIFICATION' | 'FINALIZATION';
  completedRemoteBatches: number;
  totalRemoteBatches: number;
  failedBatchIndex?: number;
  unresolvedRemoteCount?: number;
  error?: string;
}
