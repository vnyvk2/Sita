/**
 * Strongly typed provider identifier union.
 */
export type MetadataProviderId = 'musicbrainz' | 'spotify' | 'discogs' | 'local' | 'user';

/**
 * Strongly typed criterion used during metadata matching.
 */
export type MatchCriterion =
  | 'title'
  | 'title_partial'
  | 'artist'
  | 'album'
  | 'duration'
  | 'duration_close'
  | 'year'
  | 'track'
  | 'index'
  | 'musicbrainz_recording_search';

/**
 * Pure domain model for core audio recording metadata.
 */
export interface RecordingMetadata {
  title: string;
  artist?: string;
  artists?: string[];
  album?: string;
  albumArtist?: string;
  genres?: string[];
  year?: number;
  trackNumber?: number;
  totalTracks?: number;
  discNumber?: number;
  totalDiscs?: number;
  composer?: string;
  duration?: number;
}

/**
 * Pure domain model for core album metadata.
 */
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

export interface OfficialTrackInput {
  trackId?: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNumber: number;
  discNumber?: number;
  duration?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

/**
 * Dedicated domain model representing a resolved album release with official track listing.
 */
export interface ResolvedAlbumRelease {
  album: AlbumMetadata;
  tracks: OfficialTrackInput[];
  provider: MetadataProviderId;
  providerReleaseId: string;
}

/**
 * Metadata defining downloadable artwork assets.
 */
export interface ArtworkMetadata {
  primaryPath?: string;
  optimizedPath?: string;
  onlineUrls?: string[];
  palette?: Record<string, string>;
}

/**
 * Metadata defining synchronized and unsynchronized lyrics.
 */
export interface LyricsMetadata {
  synchronizedLyrics?: string;
  unsynchronizedLyrics?: string;
  language?: string;
  copyright?: string;
}

/**
 * Metadata provided by external identity/discovery providers (MusicBrainz, Spotify, Discogs, etc.).
 */
export interface ProviderMetadata {
  provider: MetadataProviderId;
  providerRecordingId?: string;
  providerReleaseId?: string;
  providerArtistId?: string;
  isrc?: string;
  label?: string;
  releaseType?: string;
  explicit?: boolean;
  confidence?: number; // 0.0 to 1.0
  matchedBy?: MatchCriterion[];
  reasons?: string[];
}

/**
 * Combined metadata candidate object representing a potential match from an external provider.
 */
export interface MetadataCandidate {
  recording: RecordingMetadata;
  provider: ProviderMetadata;
  artwork?: ArtworkMetadata;
  lyrics?: LyricsMetadata;
}
