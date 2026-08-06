export type MetadataResourceType =
  | 'track'
  | 'album'
  | 'artist'
  | 'release'
  | 'artwork'
  | 'genre'
  | 'relationship';

export interface MetadataResource<T = Record<string, unknown>> {
  id: string | number;
  type: MetadataResourceType;
  uri?: string;
  attributes: T;
  updatedAt?: number;
}

export interface TrackResourceAttributes {
  songId: number;
  path: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
  artworkPath?: string;
}

export interface AlbumResourceAttributes {
  albumId?: number;
  title: string;
  artist?: string;
  year?: number;
  trackCount?: number;
  artworkPath?: string;
}
