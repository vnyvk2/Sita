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
