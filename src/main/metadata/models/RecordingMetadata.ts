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
  provider: string; // e.g. 'musicbrainz' | 'spotify' | 'discogs'
  providerRecordingId?: string;
  providerReleaseId?: string;
  providerArtistId?: string;
  isrc?: string;
  label?: string;
  releaseType?: string;
  explicit?: boolean;
  confidence?: number; // 0.0 to 1.0
  matchedBy?: string[];
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
