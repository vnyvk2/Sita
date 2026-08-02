import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { RepairCandidate } from '../models/RepairCandidate';

export interface PlaylistRepairStrategy {
  readonly name: string;
  evaluate(entry: LibraryResolvedPlaylistEntry, candidate: LibrarySongRecord): RepairCandidate | null;
}
