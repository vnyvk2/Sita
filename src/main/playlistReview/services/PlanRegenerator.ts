import type { OverrideApplier } from './OverrideApplier';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { UserOverride } from '../models/UserOverride';

export class PlanRegenerator {
  constructor(private overrideApplier: OverrideApplier) {}

  regeneratePlan(originalPlan: PlaylistImportPlan, overrides: UserOverride[]): PlaylistImportPlan {
    const updatedEntries = this.overrideApplier.applyOverrides(originalPlan.entries, overrides);

    const importedEntries = updatedEntries.filter((e) => e.decision === 'IMPORT').length;
    const skippedEntries = updatedEntries.filter((e) => e.decision !== 'IMPORT').length;

    return {
      ...originalPlan,
      entries: updatedEntries,
      statistics: {
        ...originalPlan.statistics,
        importedEntries,
        skippedEntries,
        plannedImportPercentage: Math.round((importedEntries / originalPlan.statistics.totalEntries) * 100)
      }
    };
  }
}
