import type { BatchExecutionPlan } from './BatchExecutionPlan';
import type { BatchExecutionSummary } from './BatchExecutionSummary';

export type BatchSessionStatus =
  | 'IDLE'
  | 'RUNNING'
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
}
