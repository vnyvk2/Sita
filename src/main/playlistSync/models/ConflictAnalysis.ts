import type { PlaylistConflict } from './PlaylistConflict';

export interface ConflictAnalysis {
  conflicts: PlaylistConflict[];
  hasConflicts: boolean;
  hasManualConflicts: boolean;
}
