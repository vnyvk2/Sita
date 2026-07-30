import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairResult } from '../models/RepairResult';
import type { LibraryLookup } from '../interfaces/LibraryLookup';

export interface PlaylistRepairStrategy {
  readonly name: string;
  repair(entry: LibraryResolvedPlaylistEntry, libraryLookup: LibraryLookup): Promise<RepairResult | null>;
}
