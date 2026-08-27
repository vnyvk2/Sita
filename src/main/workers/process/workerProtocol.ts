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

// Reserved for Phase C2
export interface CmdWalkDirectory {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_WALK_DIRECTORY';
  taskId: string;
  roots: Array<{ id: number; path: string }>;
  supportedExtensions: string[];
}

// Reserved for Phase C3
export interface CmdParseTrackBatch {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_PARSE_TRACK_BATCH';
  taskId: string;
  batchId: number;
  tracks: Array<{ songPath: string; folderId: number }>;
}

// Reserved for Phase C4
export interface CmdGenerateAsset {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'CMD_GENERATE_ASSET';
  jobId: string;
  jobType: 'artwork' | 'waveform' | 'replaygain';
  input: {
    songId: number;
    filePath: string;
    targetCacheDir: string;
    version: number;
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

// Reserved for Phase C2
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
}

// Reserved for Phase C3
export interface EvtTracksParsedBatch {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_TRACKS_PARSED_BATCH';
  taskId: string;
  batchId: number;
  tracks: Array<{
    path: string;
    folderId: number;
    title: string;
    duration: number;
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
    language?: string;
    artworkHash?: string;
    artworkTempPath?: string;
    optimizedArtworkTempPath?: string;
    artworkWidth?: number;
    artworkHeight?: number;
  }>;
}

// Reserved for Phase C4
export interface EvtAssetComplete {
  protocolVersion: typeof MEDIA_WORKER_PROTOCOL_VERSION;
  type: 'EVT_ASSET_COMPLETE';
  jobId: string;
  success: boolean;
  outputFilePath?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

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
