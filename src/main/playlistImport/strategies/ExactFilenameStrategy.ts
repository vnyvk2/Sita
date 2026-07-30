import { basename } from 'path';
import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairResult } from '../models/RepairResult';
import type { LibraryLookup } from '../interfaces/LibraryLookup';

export class ExactFilenameStrategy implements PlaylistRepairStrategy {
  readonly name = 'ExactFilename';

  async repair(entry: LibraryResolvedPlaylistEntry, libraryLookup: LibraryLookup): Promise<RepairResult | null> {
    if (!libraryLookup.findByFilename) return null;

    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const filename = basename(rawLocation);
    if (!filename) return null;

    const matches = await libraryLookup.findByFilename(filename);
    if (matches.length === 0) return null;

    const bestMatch = matches[0];
    return {
      repaired: true,
      candidate: {
        song: bestMatch,
        confidence: 95,
        strategyName: this.name,
        reason: `Matched exact filename: ${filename}`
      },
      allCandidates: matches.map((song) => ({
        song,
        confidence: 95,
        strategyName: this.name,
        reason: `Matched exact filename: ${filename}`
      }))
    };
  }
}
