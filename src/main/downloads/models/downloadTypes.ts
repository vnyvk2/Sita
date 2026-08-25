export const ONLINE_DOWNLOADS_MAX_DURATION_SECS = 60 * 15;
export const ONLINE_PLAYLIST_MAX_ENTRIES = 200;

export type SourceType = 'YOUTUBE';

export type DuplicatePolicy = 'SKIP' | 'OVERWRITE' | 'KEEP_BOTH';

export type DownloadStatus =
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'SKIPPED_DUPLICATE'
  | 'CANCELLED'
  | 'FAILED';

/** A track returned by an online search or a playlist enumeration. */
export interface OnlineTrackResult {
  /** Stable platform identifier (YouTube video id). Primary dedupe key. */
  videoId: string;
  title: string;
  channel: string;
  /** Duration in seconds. 0 when unknown. */
  duration: number;
  viewCount?: number;
  /** Thumbnail urls ordered from smallest to largest. */
  thumbnails: string[];
}

export interface OnlinePlaylistInfo {
  playlistId: string;
  title: string;
  channel?: string;
  entries: OnlineTrackResult[];
  /** Entries dropped for being non-songs (too long / live streams). */
  excludedCount: number;
}

export interface OnlineDownloadRequest {
  videoId: string;
  /** Directory where yt-dlp writes the file. Exactly one job owns this directory. */
  outputDir: string;
  abortSignal: AbortSignal;
  onProgress?: (percent: number) => void;
}

export interface OnlineDownloadOutput {
  /** Absolute path of the verified audio file inside outputDir. */
  filePath: string;
  containerExt: string;
  durationSecs?: number;
}

/** Options accepted when enqueueing a job into the DownloadManager. */
export interface EnqueueDownloadInput {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  thumbnailUrl?: string;
  durationSecs?: number;
  playlistId?: string;
  playlistName?: string;
}

/** Serializable job snapshot pushed to the renderer. */
export interface DownloadJobState {
  jobId: string;
  sourceType: SourceType;
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  playlistId?: string;
  playlistName?: string;
  status: DownloadStatus;
  progress: number;
  /** Set once the file reached its final destination. */
  filePath?: string;
  error?: string;
  createdAt: number;
}

export interface DownloadsSnapshot {
  jobs: DownloadJobState[];
  activeCount: number;
  queuedCount: number;
}
