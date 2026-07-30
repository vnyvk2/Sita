import type { LibraryResolvedPlaylistEntry } from './LibraryResolvedPlaylistEntry';
import type { ImportDecision } from './ImportDecision';
import type { ImportWarning } from './ImportWarning';

export interface PlaylistImportPlanEntry {
  source: LibraryResolvedPlaylistEntry;
  decision: ImportDecision;
  notes?: string[];
  warnings?: ImportWarning[];
}
