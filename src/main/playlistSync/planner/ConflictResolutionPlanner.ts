import type { ConflictResolutionStrategy } from '../interfaces/ConflictResolutionStrategy';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { ConflictAnalysis } from '../models/ConflictAnalysis';
import type { ConflictSummary } from '../models/ConflictSummary';
import type { ConflictResolution } from '../models/ConflictResolution';

export interface ResolvedSyncPlanResult {
  resolvedPlan: PlaylistSyncPlan;
  appliedResolutions: ConflictResolution[];
  conflictSummary: ConflictSummary;
}

export class ConflictResolutionPlanner {
  constructor(private strategies: ConflictResolutionStrategy[]) {}

  resolveConflicts(plan: PlaylistSyncPlan, analysis: ConflictAnalysis): ResolvedSyncPlanResult {
    let currentOps = [...plan.operations];
    const appliedResolutions: ConflictResolution[] = [];
    let resolvedAutomatically = 0;
    let manualConflicts = 0;
    let ignoredConflicts = 0;

    for (const conflict of analysis.conflicts) {
      let resolved = false;
      for (const strategy of this.strategies) {
        const nextOps = strategy.resolve(conflict, currentOps);
        if (nextOps.length !== currentOps.length) {
          currentOps = nextOps;
          resolved = true;
          resolvedAutomatically++;
          appliedResolutions.push({
            conflictId: conflict.id,
            strategyName: strategy.name,
            action: `Applied resolution strategy ${strategy.name} for ${conflict.type}`,
            applied: true
          });
          break;
        }
      }

      if (!resolved) {
        if (conflict.requiresUserDecision) {
          manualConflicts++;
        } else {
          ignoredConflicts++;
        }
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
      appliedResolutions,
      conflictSummary
    };
  }
}
