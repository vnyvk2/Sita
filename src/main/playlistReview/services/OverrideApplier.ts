import type { PlaylistImportPlanEntry } from '../../playlistImport/models/PlaylistImportPlanEntry';
import type { UserOverride } from '../models/UserOverride';

export class OverrideApplier {
  applyOverrides(entries: PlaylistImportPlanEntry[], overrides: UserOverride[]): PlaylistImportPlanEntry[] {
    return entries.map((entry) => {
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
  }
}
