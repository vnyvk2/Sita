import type {
  OnlineDownloadOutput,
  OnlineDownloadRequest,
  OnlinePlaylistInfo,
  OnlineTrackResult,
  SourceType
} from '../models/downloadTypes';

export class ExtractorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'BINARY_MISSING'
      | 'UNSUPPORTED_SOURCE'
      | 'EXTRACTION_FAILED'
      | 'NOT_FOUND'
      | 'CANCELLED'
  ) {
    super(message);
    this.name = 'ExtractorError';
  }
}

export interface OnlineSearchOptions {
  limit?: number;
}

/**
 * Pluggable backend for online track search + audio acquisition. Implemented today by
 * YtDlpExtractor; replaceable without touching the DownloadManager or UI.
 */
export interface OnlineExtractor {
  readonly id: SourceType;

  /** Human-readable display name used in error surfaces. */
  readonly displayName: string;

  search(query: string, options?: OnlineSearchOptions): Promise<OnlineTrackResult[]>;

  /**
   * Accepts a playlist URL/ID (a watch URL containing both video and list ids is also fine).
   * Rejects unbounded radio mixes and caps entry count.
   */
  resolvePlaylist(urlOrId: string): Promise<OnlinePlaylistInfo>;

  /**
   * Downloads a single track's audio into outputDir (the caller owns staging lifecycle) and returns
   * the verified completed file. Rejects unsupported containers instead of silently returning
   * them.
   */
  download(request: OnlineDownloadRequest): Promise<OnlineDownloadOutput>;
}
