import type { LibraryResolvedPlaylistEntry } from './LibraryResolvedPlaylistEntry';
import type { ImportDecision } from './ImportDecision';

export interface PlaylistImportPlanEntry {
  decision: ImportDecision;
  libraryEntry: LibraryResolvedPlaylistEntry;
}
