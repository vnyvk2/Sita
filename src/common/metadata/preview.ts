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
  /** Local song ID in library (0 or undefined if missing locally) */
  localSongId: number;
  /** Remote track ID from provider release (e.g. "rec-123", "t1") */
  remoteTrackId?: string;
  songPath: string;
  oldTitle: string;
  oldArtist?: string;
  /** Release-level artist prior to apply (albums_artists junction truth) */
  oldAlbumArtist?: string;
  oldAlbum?: string;
  oldYear?: number;
  oldTrackNumber?: number;
  oldDiscNumber?: number;
  oldGenre?: string;
  oldIsrc?: string;
  oldMbid?: string;
  /** Official disc number from release */
  discNumber?: number;
  /** Official track number / position from release */
  trackNumber?: number;
  /** Remote track title (for missing tracks or quick access without diff parsing) */
  remoteTitle?: string;
  /** Remote track artist */
  remoteArtist?: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  why: string;
  reasons: string[];
  fieldDiffs: MetadataFieldDiff[];
  applyTrack: boolean;
  hasWarnings: boolean;
  warningCount: number;
  isMissingLocally?: boolean;
}

/**
 * Returns a stable, collision-free React key for a TrackMatchPreview item across multi-disc releases.
 */
export function getTrackPreviewKey(match: TrackMatchPreview, idx?: number): string {
  if (match.isMissingLocally || match.localSongId <= 0) {
    return `missing-d${match.discNumber ?? 1}-t${match.trackNumber ?? idx ?? 0}-${match.remoteTrackId ?? 'unmatched'}`;
  }
  return `local-${match.localSongId}`;
}

export interface GlobalAlbumMutations {
  albumTitle?: string;
  albumArtist?: string;
  year?: number;
  genre?: string;
  applyAlbumTitle?: boolean;
  applyAlbumArtist?: boolean;
  applyYear?: boolean;
  applyGenre?: boolean;
}

export interface ApplyPreviewOptions {
  replaceArtwork?: boolean;
  artworkUrl?: string;
  operationId?: string;
  globalMutations?: GlobalAlbumMutations;
}

export interface AlbumTagPreview {
  album: AlbumMetadata;
  matches: TrackMatchPreview[];
  warnings: string[];
  overallConfidence: number;
  confidenceLevel: ConfidenceLevel;
  provider: MetadataProviderId;
  providerReleaseId: string;
  contributingProviders?: MetadataProviderId[];
  resolvedRelease?: ResolvedAlbumRelease;
}

// --- Unified Workflow DTOs ---

export interface WorkflowCandidate {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  style?: string;
  coverArtUrl?: string;
  provider: MetadataProviderId;
  confidenceScore?: number;
  rawItem?: any;
}

export interface WorkflowMatch {
  localSongId: number;
  songPath: string;
  matchedCandidateId?: string;
  suggestedMetadata: Record<string, any>;
  confidence: number;
  fieldDiffs: MetadataFieldDiff[];
}

export interface WorkflowSupportedField {
  fieldId: string;
  displayName: string;
  category: string;
  defaultEnabled: boolean;
}

export interface MetadataPreview {
  workflowType: string;
  primaryCandidate: WorkflowCandidate;
  candidates: WorkflowCandidate[];
  matches: WorkflowMatch[];
  supportedFields: WorkflowSupportedField[];
  provider: MetadataProviderId;
}
