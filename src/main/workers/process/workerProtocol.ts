/**
 * Versioned IPC message protocol between Main Process and Media Worker (utilityProcess).
 *
 * Rules:
 * 1. Every message MUST carry protocolVersion = MEDIA_WORKER_PROTOCOL_VERSION.
 * 2. Handshake ensures version alignment before tasks can be dispatched.
 * 3. Unknown or malformed messages MUST fail safely with EVT_PROTOCOL_ERROR.
 * 4. Worker process NEVER imports database, Drizzle, or ORM schemas.
 */

export const MEDIA_WORKER_PROTOCOL_VERSION = 1 as const;

// ============================================================================
// Main -> Worker Commands
// ============================================================================

export interface CmdPing {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_PING';
  timestamp: number;
}

export interface CmdShutdown {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_SHUTDOWN';
}

export interface CmdCancelTask {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_CANCEL_TASK';
  taskId: string;
}

export interface CmdAckBatch {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_ACK_BATCH';
  taskId: string;
  batchId: number;
}

// Phase C2: Directory walking
export interface CmdWalkDirectory {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_WALK_DIRECTORY';
  taskId: string;
  roots: Array<{ id: number; path: string }>;
  supportedExtensions: string[];
  maxConcurrency?: number;
}

// Phase C3: Tag parsing and batch ingestion
export interface CmdParseTrackBatch {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_PARSE_TRACK_BATCH';
  taskId: string;
  tracks: Array<{ songPath: string; folderId?: number }>;
  batchSize?: number;
}

// Phase C4: Persistent asset jobs
export interface CmdGenerateAsset {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_GENERATE_ASSET';
  taskId: string;
  jobType: 'artwork' | 'waveform' | 'replaygain';
  input: {
    sourceFilePath: string;
    destinationPath: string;
    metadata?: Record<string, unknown>;
  };
}

export type MainToWorkerCommand =
  | CmdPing
  | CmdShutdown
  | CmdCancelTask
  | CmdAckBatch
  | CmdWalkDirectory
  | CmdParseTrackBatch
  | CmdGenerateAsset;

// ============================================================================
// Worker -> Main Events
// ============================================================================

export interface EvtReady {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_READY';
  pid: number;
  supportedOps: string[];
}

export interface EvtPong {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_PONG';
  clientTimestamp: number;
  serverTimestamp: number;
}

export interface EvtShutdownDrained {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_SHUTDOWN_DRAINED';
}

export interface EvtProtocolError {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_PROTOCOL_ERROR';
  error: string;
  rawType?: string;
  receivedVersion?: number;
}

export interface EvtErrorSummary {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_ERROR_SUMMARY';
  taskId: string;
  category: 'ENOENT' | 'CORRUPT_TAG' | 'IO_ERROR' | 'UNKNOWN';
  count: number;
  sampleMessages: string[];
}

// Phase C2: Directory walking events
export interface EvtWalkProgress {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_WALK_PROGRESS';
  taskId: string;
  discoveredCount: number;
  currentPath?: string;
}

export interface EvtWalkComplete {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_WALK_COMPLETE';
  taskId: string;
  snapshots: Array<{
    path: string;
    fileModifiedAt: Date | string;
    size: number;
    rootId: number;
    dirPath?: string;
  }>;
  failedSubtrees: string[];
  failedPaths: string[];
  cancelled?: boolean;
  error?: string;
}

// Phase C3: Tag parsing events and DTOs
export interface ParsedTrackDTO {
  songPath: string;
  folderId?: number;
  title: string;
  duration: string;
  artists: string[];
  albumArtists: string[];
  album?: string;
  genres: string[];
  year?: number;
  trackNumber?: number;
  diskNumber?: number;
  bitRate?: number;
  sampleRate?: number;
  noOfChannels?: number;
  musicBrainzRecordingId?: string;
  isrc?: string;
  language?: string;
  fileCreatedAt: Date | string;
  fileModifiedAt: Date | string;
  rawPictureBytes?: Uint8Array;
}

export interface EvtTracksParsedBatch {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_TRACKS_PARSED_BATCH';
  taskId: string;
  batchId: number;
  isLastBatch: boolean;
  tracks: ParsedTrackDTO[];
  errors: Array<{ path: string; error: string; code?: string }>;
  cancelled?: boolean;
}

// Phase C4: Persistent asset generation events
export type EvtAssetComplete =
  | {
      protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
      type: 'EVT_ASSET_COMPLETE';
      taskId: string;
      jobType: 'artwork' | 'waveform' | 'replaygain';
      success: true;
      outputFilePath: string;
      metadata: Record<string, unknown>;
      cancelled?: false;
    }
  | {
      protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
      type: 'EVT_ASSET_COMPLETE';
      taskId: string;
      jobType: 'artwork' | 'waveform' | 'replaygain';
      success: false;
      error: string;
      cancelled?: boolean;
    };

export type WorkerToMainEvent =
  | EvtReady
  | EvtPong
  | EvtShutdownDrained
  | EvtProtocolError
  | EvtErrorSummary
  | EvtWalkProgress
  | EvtWalkComplete
  | EvtTracksParsedBatch
  | EvtAssetComplete;

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidProtocolEnvelope(data: unknown): data is { protocolVersion: number; type: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'protocolVersion' in data &&
    typeof (data as { protocolVersion: unknown }).protocolVersion === 'number' &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string'
  );
}
