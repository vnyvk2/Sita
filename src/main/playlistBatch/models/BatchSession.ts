import type { BatchExecutionPlan } from './BatchExecutionPlan';
import type { BatchExecutionSummary } from './BatchExecutionSummary';

export type BatchSessionStatus =
  | 'RUNNING'
  | 'CANCELLING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface BatchSession {
  id: string;
  plan: BatchExecutionPlan;
  status: BatchSessionStatus;
  startedAt: Date;
  completedAt?: Date;
  summary?: BatchExecutionSummary;
  currentProcessed?: number;
  currentPlaylistName?: string;
}

