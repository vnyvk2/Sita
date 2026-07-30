import type { ImportStatistics } from './ImportStatistics';
import type { PlaylistImportExecutionResult } from './PlaylistImportExecutionResult';
import type { ImportWarning } from './ImportWarning';
import type { RepairSummary } from './RepairSummary';

export type SessionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'UNDONE';

export interface PlaylistImportSession {
  id: string;
  sourceFile: string;
  playlistName: string;
  startedAt: Date;
  completedAt?: Date;
  status: SessionStatus;
  statistics?: ImportStatistics;
  execution?: PlaylistImportExecutionResult;
  warnings: ImportWarning[];
  repairSummary?: RepairSummary;
}
