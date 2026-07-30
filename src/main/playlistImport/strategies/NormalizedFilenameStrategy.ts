import { basename, extname } from 'path';
import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairResult } from '../models/RepairResult';
import type { LibraryLookup } from '../interfaces/LibraryLookup';

export class NormalizedFilenameStrategy implements PlaylistRepairStrategy {
  readonly name = 'NormalizedFilename';

  private normalize(str: string): string {
    const ext = extname(str);
    const withoutExt = ext ? str.slice(0, -ext.length) : str;
    return withoutExt.toLowerCase().replace(/[-_\s]+/g, '');
  }

  async repair(entry: LibraryResolvedPlaylistEntry, libraryLookup: LibraryLookup): Promise<RepairResult | null> {
    if (!libraryLookup.findByFilename) return null;

    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const filename = basename(rawLocation);
    if (!filename) return null;

    const normalizedTarget = this.normalize(filename);
    if (!normalizedTarget) return null;

    // Retrieve candidates by partial filename and test normalized string equivalence
    const candidates = await libraryLookup.findByFilename('');
    const matches = candidates.filter((song) => {
      const songFilename = basename(song.path);
      return this.normalize(songFilename) === normalizedTarget;
    });

    if (matches.length === 0) return null;

    const bestMatch = matches[0];
    return {
      repaired: true,
      candidate: {
        song: bestMatch,
        confidence: 85,
        strategyName: this.name,
        reason: `Matched normalized filename: ${normalizedTarget}`
      },
      allCandidates: matches.map((song) => ({
        song,
        confidence: 85,
        strategyName: this.name,
        reason: `Matched normalized filename: ${normalizedTarget}`
      }))
    };
  }
}
