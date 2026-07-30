import type { BatchItem } from './BatchItem';
import type { BatchExecutionPolicy } from './BatchExecutionPolicy';

export interface BatchExecutionPlan {
  id: string;
  items: BatchItem[];
  executionOrder: string[];
  policy: BatchExecutionPolicy;
}
