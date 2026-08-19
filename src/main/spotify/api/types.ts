import type { SpotifyTrackInput } from '../../metadata/identity/adapters/SpotifyToCanonicalIdentity';

export interface SpotifyUserProfile {
  id: string;
  displayName: string | null;
  email?: string;
  product?: string;
  images?: Array<{ url: string; height?: number; width?: number }>;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  uri: string;
  snapshotId: string;
  collaborative: boolean;
  isPublic: boolean | null;
  imageUrl?: string;
  tracksTotal: number;
}

export interface SpotifyPlaylistPaging {
  items: SpotifyPlaylistSummary[];
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
}

export interface SpotifyEpisodeInput {
  id: string;
  name: string;
  description?: string;
  duration_ms: number;
  type: 'episode' | string;
  uri?: string;
}

export type SpotifyItemPayload =
  | SpotifyTrackInput
  | SpotifyEpisodeInput
  | ({ type?: string; [key: string]: unknown } & { id?: string; name?: string });

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
  description: string | null;
  uri: string;
  snapshotId: string;
  imageUrl?: string;
  owner?: { id: string; display_name?: string };
  tracksTotal: number;
}
