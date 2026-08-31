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
  globalRank: number; // 1-indexed true global/popularity rank
  title: string;
  artist?: string;
  albumTitle?: string;
  durationSec?: number; // duration normalized to seconds
  listeners?: number;
  playcount?: number;
  localSongId?: number;
  isInLibrary: boolean;
  matchConfidence?: 'exact' | 'fuzzy';
  previewUrl?: string;
  previewProvider?: 'iTunes' | 'Deezer';
  coverMedium?: string;
}

export interface ArtistFeaturedImage {
  url: string;
  source: 'Local' | 'Deezer' | 'Wikipedia' | 'iTunes';
}

export interface ArtistOnlineProfilePayload {
  artistId: number;
  artistName: string;
  fetchedAt: number;
  bioSummary?: string;
  bioFull?: string;
  bioParagraphs: string[];
  bioSource?: 'Last.fm' | 'Wikipedia';
  bioUrl?: string;
  featuredImage?: ArtistFeaturedImage;
  tags: Array<{ name: string; url: string }>;
  topTracks: ArtistPopularTrack[];
  similarArtists: SimilarArtistInfo;
  externalLinks: Array<{ name: string; url: string; icon: string }>;
}
