import type { BatchExecutionPolicy } from './BatchExecutionPolicy';
import type { BatchItem } from './BatchItem';
import type { ExecutionLevel } from './ExecutionLevel';

export interface BatchExecutionPlan {
  id: string;
  items: BatchItem[];
  executionOrder: string[];
  executionLevels: ExecutionLevel[];
  policy: BatchExecutionPolicy;
}
