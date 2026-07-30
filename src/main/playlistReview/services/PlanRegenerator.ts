import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistImportPlanEntry } from '../../playlistImport/models/PlaylistImportPlanEntry';
import type { UserOverride } from '../models/UserOverride';

export class PlanRegenerator {
  regeneratePlan(originalPlan: PlaylistImportPlan, overrides: UserOverride[]): PlaylistImportPlan {
    const updatedEntries: PlaylistImportPlanEntry[] = originalPlan.entries.map((entry) => {
      const override = overrides.find((o) => o.entryPosition === entry.source.position);
      if (!override) return entry;

      if (override.type === 'FORCE_SKIP') {
        return {
          ...entry,
          decision: 'SKIP_MISSING',
          notes: override.reason ?? 'Skipped by user override'
        };
      }

      if (override.type === 'SELECT_CANDIDATE' && override.selectedSongId !== undefined) {
        return {
          ...entry,
          decision: 'IMPORT',
          notes: override.reason ?? 'Selected manually by user',
          source: {
            ...entry.source,
            trackReference: {
              ...entry.source.trackReference,
              libraryMatch: {
                matchedSongId: override.selectedSongId,
                status: 'MATCHED',
                matchType: 'REPAIRED',
                confidence: 100,
                diagnostics: ['Selected manually via review dialog']
              }
            }
          }
        };
      }

      if (override.type === 'FORCE_IMPORT') {
        return {
          ...entry,
          decision: 'IMPORT',
          notes: override.reason ?? 'Forced import by user'
        };
      }

      return entry;
    });

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
