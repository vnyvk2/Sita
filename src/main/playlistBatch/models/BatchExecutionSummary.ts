export interface BatchExecutionSummary {
  batchId: string;
  totalPlaylists: number;
  successfulCount: number;
  failedCount: number;
  skippedCount: number;
  pausedCount: number;
  importedSongsCount: number;
  durationMs: number;
}
