export interface SpotifyUserDTO {
  id: string;
  display_name: string | null;
  images?: Array<{ url: string; height?: number; width?: number }>;
  email?: string;
  country?: string;
  product?: string;
}

export interface SpotifyTrackInput {
  id?: string;
  name: string;
  duration_ms?: number;
  external_ids?: { isrc?: string };
  artists?: Array<{ name: string }>;
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
  uri?: string;
  owner?: { id: string; display_name?: string };
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string;
  tracksTotal: number;
  snapshotId?: string;
  uri?: string;
  ownerName?: string;
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylistDetails[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}
