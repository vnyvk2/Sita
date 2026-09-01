import type { ImportDecision } from './ImportDecision';
import type { ImportWarning } from './ImportWarning';
import type { LibraryResolvedPlaylistEntry } from './LibraryResolvedPlaylistEntry';

export interface PlaylistImportPlanEntry {
  source: LibraryResolvedPlaylistEntry;
  decision: ImportDecision;
  notes?: string[];
  warnings?: ImportWarning[];
}
