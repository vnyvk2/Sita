import type { LibraryResolvedPlaylist } from '../models/LibraryResolvedPlaylist';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportPlanEntry } from '../models/PlaylistImportPlanEntry';
import type { ImportDecision } from '../models/ImportDecision';
import type { ImportStatistics } from '../models/ImportStatistics';
import type { ImportWarning } from '../models/ImportWarning';

export class PlaylistImportPlanner {
  createPlan(playlist: LibraryResolvedPlaylist, initialWarnings: ImportWarning[] = []): PlaylistImportPlan {
    const planEntries: PlaylistImportPlanEntry[] = [];
    const warnings: ImportWarning[] = [...initialWarnings];

    let importedEntries = 0;
    let repairedEntries = 0;
    let missingEntries = 0;
    let notInLibraryEntries = 0;
    let invalidEntries = 0;

    const getDiagReason = (diag?: any): string | undefined => {
      if (!diag) return undefined;
      return typeof diag === 'string' ? diag : diag.reason;
    };

    for (const entry of playlist.entries) {
      const match = entry.trackReference.libraryMatch;
      let decision: ImportDecision;

      switch (match.status) {
        case 'MATCHED':
          decision = 'IMPORT';
          importedEntries++;
          if (match.matchType === 'REPAIRED') {
            repairedEntries++;
          }
          break;

        case 'MISSING':
          decision = 'SKIP_MISSING';
          missingEntries++;
          warnings.push({
            code: 'MISSING_FILE',
            message: getDiagReason(match.diagnostics?.[0]) ?? 'Track file missing from disk',
            lineNumber: entry.sourceLine
          });
          break;

        case 'NOT_IN_LIBRARY':
          decision = 'SKIP_NOT_IN_LIBRARY';
          notInLibraryEntries++;
          warnings.push({
            code: 'NOT_IN_LIBRARY',
            message: getDiagReason(match.diagnostics?.[0]) ?? 'File exists on disk but is not scanned into Nora library',
            lineNumber: entry.sourceLine
          });
          break;

        case 'UNRESOLVED':
        case 'INVALID_URI':
        case 'UNVERIFIED':
        default:
          decision = 'SKIP_INVALID';
          invalidEntries++;
          warnings.push({
            code: 'INVALID_REFERENCE',
            message: getDiagReason(match.diagnostics?.[0]) ?? 'Unresolvable or invalid track reference',
            lineNumber: entry.sourceLine
          });
          break;
      }

      planEntries.push({
        source: entry,
        decision
      });
    }

    const totalEntries = playlist.entries.length;
    const skippedEntries = missingEntries + notInLibraryEntries + invalidEntries;
    const plannedImportPercentage = totalEntries > 0 ? Math.round((importedEntries / totalEntries) * 100) : 0;

    const statistics: ImportStatistics = {
      totalEntries,
      importedEntries,
      repairedEntries,
      skippedEntries,
      missingEntries,
      notInLibraryEntries,
      invalidEntries,
      warningCount: warnings.length,
      plannedImportPercentage
    };

    return {
      playlistName: playlist.name,
      description: playlist.description,
      entries: planEntries,
      statistics,
      warnings,
      sourceFormat: playlist.sourceFormat,
      sourceFile: playlist.sourceFile,
      createdByImporter: playlist.createdByImporter
    };
  }
}
