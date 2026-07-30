import type { PlaylistDependencyGraph } from './PlaylistDependencyGraph';
import type { BatchItem } from '../models/BatchItem';
import type { BatchExecutionPolicy } from '../models/BatchExecutionPolicy';
import type { BatchExecutionPlan } from '../models/BatchExecutionPlan';

export class PlaylistBatchPlanner {
  constructor(private dependencyGraph: PlaylistDependencyGraph) {}

  createBatchPlan(
    items: BatchItem[],
    policy: BatchExecutionPolicy = 'CONTINUE_ON_ERROR'
  ): BatchExecutionPlan {
    const id = `batch_plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const executionOrder = this.dependencyGraph.sortTopologically(items);

    return {
      id,
      items,
      executionOrder,
      policy
    };
  }
}
