import type { SongMetadataSnapshot } from '../history/MetadataHistoryService';

/**
 * ─── Frozen contract (2c P2 prerequisite) ─────────────────────────────────── One normalized
 * mutation = one authoritative state transition request for a single song, owned end-to-end by
 * MetadataApplyOrchestrator.
 *
 * Requirements encoded here (per 2c review): - scalar metadata, release-level album artist,
 * recording identity (isrc/mbid) - artwork intent (buffer must already be size-validated) -
 * file-write intent incl. deferred eligibility - snapshot/undo description - stable identity
 * (mutationId) making replay idempotent after restart
 */

export type ApplyFieldId =
  | 'title'
  | 'artist'
  | 'album'
  | 'year'
  | 'trackNumber'
  | 'discNumber'
  | 'genre'
  | 'style'
  | 'isrc'
  | 'musicBrainzRecordingId';

export interface NormalizedFieldMutation {
  fieldId: ApplyFieldId;
  oldValue?: string | number | null;
  newValue: string | number;
  providerId?: string;
  confidenceScore?: number;
}

export interface NormalizedArtwork {
  /** Already-downloaded and size-validated buffer */
  buffer: Buffer;
}

export interface NormalizedMutation {
  /** Stable identity: `${operationId}:${songId}` — makes replay idempotent */
  mutationId: string;
  operationId: string;
  songId: number;
  filePath: string;

  fields: NormalizedFieldMutation[];

  /** Release-level artist (junction truth) - NEVER derived from track artist */
  albumArtistNewValue?: string;

  artwork?: NormalizedArtwork;

  fileWrite: {
    /**
     * True -> if the song is currently playing, the write is routed to the durable pending queue
     * instead of failing false -> attempt immediately regardless
     */
    deferredIfPlaying: boolean;
  };

  undo: {
    description: string;
    albumTitle?: string;
    /**
     * Optional caller-supplied pre-state. When omitted, the orchestrator captures a VALUE-COMPLETE
     * snapshot from the DB before mutating.
     */
    previousSongs?: SongMetadataSnapshot[];
  };
}

export interface OrchestratorResult {
  success: boolean;
  updatedCount: number;
  failedCount: number;
  deferredCount: number;
  errors: string[];
}
