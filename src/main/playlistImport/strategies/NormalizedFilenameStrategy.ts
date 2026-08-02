import { basename, extname } from 'path';
import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { RepairCandidate } from '../models/RepairCandidate';

export class NormalizedFilenameStrategy implements PlaylistRepairStrategy {
  readonly name = 'NormalizedFilename';

  private normalize(str: string): string {
    const ext = extname(str);
    const withoutExt = ext ? str.slice(0, -ext.length) : str;
    return withoutExt.toLowerCase().replace(/[-_\s]+/g, '');
  }

  evaluate(entry: LibraryResolvedPlaylistEntry, candidate: LibrarySongRecord): RepairCandidate | null {
    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const targetFilename = basename(rawLocation);
    const candidateFilename = basename(candidate.path);

    if (!targetFilename || !candidateFilename) return null;

    const normalizedTarget = this.normalize(targetFilename);
    const normalizedCandidate = this.normalize(candidateFilename);

    if (!normalizedTarget || !normalizedCandidate) return null;

    if (normalizedTarget === normalizedCandidate) {
      return {
        song: candidate,
        confidence: 85,
        strategyName: this.name,
        reason: `Matched normalized filename: ${normalizedTarget}`
      };
    }

    return null;
  }
}
