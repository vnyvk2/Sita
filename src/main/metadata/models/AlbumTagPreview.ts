import type { AlbumMetadata, MetadataProviderId } from './RecordingMetadata';
import type { MetadataFieldDiff } from './MetadataDiff';
import type { ConfidenceLevel } from '../services/AlbumMetadataService';

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
  applyTrack: boolean; // Track-level apply toggle
}

export interface AlbumTagPreview {
  album: AlbumMetadata;
  matches: TrackMatchPreview[];
  warnings: string[];
  overallConfidence: number;
  confidenceLevel: ConfidenceLevel;
  provider: MetadataProviderId;
  providerReleaseId: string;
}
