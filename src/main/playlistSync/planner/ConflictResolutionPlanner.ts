import type { ConflictResolutionStrategy } from '../interfaces/ConflictResolutionStrategy';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { ConflictAnalysis } from '../models/ConflictAnalysis';
import type { ConflictSummary } from '../models/ConflictSummary';

export interface ResolvedSyncPlanResult {
  resolvedPlan: PlaylistSyncPlan;
  conflictSummary: ConflictSummary;
}

export class ConflictResolutionPlanner {
  constructor(private strategies: ConflictResolutionStrategy[]) {}

  resolveConflicts(plan: PlaylistSyncPlan, analysis: ConflictAnalysis): ResolvedSyncPlanResult {
    let currentOps = [...plan.operations];
    let resolvedAutomatically = 0;
    let manualConflicts = 0;
    let ignoredConflicts = 0;

    for (const conflict of analysis.conflicts) {
      if (conflict.requiresUserDecision) {
        manualConflicts++;
        continue;
      }

      let resolved = false;
      for (const strategy of this.strategies) {
        const nextOps = strategy.resolve(conflict, currentOps);
        if (nextOps.length !== currentOps.length) {
          currentOps = nextOps;
          resolved = true;
          resolvedAutomatically++;
          break;
        }
      }

      if (!resolved) {
        ignoredConflicts++;
      }
    }

    const additionsCount = currentOps.filter((op) => op.type === 'ADD_SONG').length;
    const removalsCount = currentOps.filter((op) => op.type === 'REMOVE_SONG').length;

    const resolvedPlan: PlaylistSyncPlan = {
      ...plan,
      operations: currentOps,
      hasChanges: currentOps.length > 0,
      additionsCount,
      removalsCount
    };

    const conflictSummary: ConflictSummary = {
      totalConflicts: analysis.conflicts.length,
      resolvedAutomatically,
      manualConflicts,
      ignoredConflicts
    };

    return {
      resolvedPlan,
      conflictSummary
    };
  }
}
