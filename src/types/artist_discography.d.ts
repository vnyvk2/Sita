import type { SimilarArtistInfo } from './last_fm_artist_info_api';

export type InLibraryStatus = 'in_library' | 'partial' | 'discover';

export interface OnlineReleaseSummary {
  id: number; // Deezer album ID
  title: string;
  releaseDate?: string;
  recordType: 'album' | 'single' | 'ep' | 'compile' | string;
  coverMedium: string;
  coverXl: string;
  trackCount: number;
  explicitLyrics: boolean;
  inLibraryStatus: InLibraryStatus;
  localAlbumId?: number;
  matchedTrackCount: number;
  totalLocalTracks: number;
}

export interface OnlineTrackDetail {
  id: number; // Deezer track ID
  title: string;
  duration: number; // in seconds
  previewUrl?: string;
  isrc?: string;
  trackPosition?: number;
  diskNumber?: number;
  localSongId?: number;
  isInLibrary: boolean;
}

export interface ArtistDiscographyPayload {
  artistId: number;
  artistName: string;
  deezerArtistId?: number;
  albums: OnlineReleaseSummary[];
  singlesAndEPs: OnlineReleaseSummary[];
  compilationsAndLive: OnlineReleaseSummary[];
  totalOnlineReleases: number;
}

export interface ArtistPopularTrack {
  id: string | number;
  title: string;
  duration?: number;
  listeners?: number;
  playcount?: number;
  previewUrl?: string;
  albumTitle?: string;
  coverMedium?: string;
  localSongId?: number;
  isInLibrary: boolean;
}

export interface ArtistOnlineProfilePayload {
  artistId: number;
  artistName: string;
  bio?: string;
  bioUrl?: string;
  tags: Array<{ name: string; url: string }>;
  topTracks: ArtistPopularTrack[];
  similarArtists: SimilarArtistInfo;
  externalLinks: Array<{ name: string; url: string; icon: string }>;
}
