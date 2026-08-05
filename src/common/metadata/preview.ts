import type { ConfidenceLevel, MetadataProviderId } from './provider';
import type { AlbumMetadata, ResolvedAlbumRelease } from './release';
import type { MetadataFieldDiff } from './diff';

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
