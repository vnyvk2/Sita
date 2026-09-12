export interface BatchExecutionSummary {
  sessionId: string;
  batchId?: string;
  totalPlaylists: number;
  successfulCount: number;
  failedCount: number;
  skippedCount: number;
  pausedCount: number;
  importedSongsCount: number;
  conflictNames: string[];
  failedDetails: { file: string; reason: string }[];
  status: 'COMPLETED' | 'CANCELLED' | 'FAILED';
  durationMs: number;
}

