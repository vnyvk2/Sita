import type { MetadataProviderId } from './provider';

export interface ArtworkMetadata {
  primaryPath?: string;
  optimizedPath?: string;
  onlineUrls?: string[];
  palette?: Record<string, string>;
}

export interface AutoTagSongInput {
  songId: number;
  path?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export type LocalSongInput = AutoTagSongInput;

export interface OfficialTrackInput {
  trackId?: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  providerRecordingId?: string;
  genres?: string[];
}

export interface AlbumMetadata {
  title: string;
  artist: string;
  year?: number;
  label?: string;
  releaseType?: string;
  artwork?: ArtworkMetadata;
  discCount?: number;
  trackCount?: number;
  releaseId?: string;
  provider?: MetadataProviderId;
}

export interface ResolvedAlbumRelease {
  album: AlbumMetadata;
  tracks: OfficialTrackInput[];
  provider: MetadataProviderId;
  providerReleaseId: string;
}

export interface CanonicalReleaseContext {
  mbid?: string;
  releaseId?: string;
  title: string;
  artist?: string;
  year?: number;
  trackCount?: number;
  trackTitles?: string[];
  externalIds?: Record<string, string>;
}
