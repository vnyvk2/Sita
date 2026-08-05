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
  album: {
    title: string;
    artist: string;
    year?: number;
    releaseId?: string;
    provider?: MetadataProviderId;
  };
  matches: TrackMatchPreview[];
  warnings: string[];
  overallConfidence: number;
  confidenceLevel: ConfidenceLevel;
  provider: MetadataProviderId;
  providerReleaseId: string;
  resolvedRelease?: unknown;
}
