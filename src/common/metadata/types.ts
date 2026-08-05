export type MetadataProviderId = 'musicbrainz' | 'discogs' | 'spotify' | 'lastfm';

export type ConfidenceLevel = 'Excellent' | 'Very Good' | 'Good' | 'Review' | 'Poor';

export type AutoTagStage =
  | 'idle'
  | 'searching'
  | 'resolving'
  | 'matching'
  | 'diffing'
  | 'applying'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ProgressEventPayload {
  stage: AutoTagStage;
  message: string;
  progressPercent?: number;
  operationId?: string;
}

export type MetadataFieldId =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'trackNumber'
  | 'discNumber'
  | 'genre'
  | 'isrc'
  | 'musicBrainzRecordingId';

export type DiffStatus = 'changed' | 'unchanged' | 'missing' | 'new';

export interface MetadataFieldDiff {
  fieldId: MetadataFieldId;
  fieldName: string;
  oldValue?: string | number;
  suggestedValue?: string | number;
  userValue?: string | number;
  status: DiffStatus;
  applyField: boolean;
}

export interface OfficialTrackInput {
  trackId: string;
  title: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  duration?: number;
  isrc?: string;
  providerRecordingId?: string;
  genres?: string[];
  year?: number;
}

export interface AlbumMetadata {
  title: string;
  artist: string;
  year?: number;
  releaseId?: string;
  provider?: MetadataProviderId;
  releaseType?: string;
  trackCount?: number;
}

export interface ResolvedAlbumRelease {
  album: AlbumMetadata;
  tracks: OfficialTrackInput[];
  provider: MetadataProviderId;
  providerReleaseId: string;
}

export interface TrackMatchPreview {
  localSongId: number;
  songPath: string;
  oldTitle: string;
  oldArtist?: string;
  oldAlbum?: string;
  oldYear?: number;
  oldTrackNumber?: number;
  oldDiscNumber?: number;
  oldGenre?: string;
  oldIsrc?: string;
  oldMbid?: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  why: string;
  reasons: string[];
  fieldDiffs: MetadataFieldDiff[];
  applyTrack: boolean;
  hasWarnings: boolean;
  warningCount: number;
}

export interface AlbumTagPreview {
  album: AlbumMetadata;
  matches: TrackMatchPreview[];
  warnings: string[];
  overallConfidence: number;
  confidenceLevel: ConfidenceLevel;
  provider: MetadataProviderId;
  providerReleaseId: string;
  resolvedRelease?: ResolvedAlbumRelease;
}

export interface MetadataAutoTagApi {
  searchAlbums: (albumName: string, artistName?: string, limit?: number, operationId?: string) => Promise<AlbumMetadata[]>;
  buildPreview: (localSongs: unknown[], releaseId: string, providerId?: MetadataProviderId, operationId?: string) => Promise<AlbumTagPreview | null>;
  applyPreview: (preview: AlbumTagPreview, operationId?: string) => Promise<{ success: boolean; updatedCount: number; failedCount: number; errors: string[] }>;
  undoLastAutoTag: (operationId?: string) => Promise<{ success: boolean; restoredCount: number; errors?: string[] }>;
  cancelAutoTag: (operationId?: string) => void;
  onProgress: (callback: (payload: ProgressEventPayload) => void) => () => void;
}
