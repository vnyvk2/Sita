import { basename } from 'path';

import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairCandidate } from '../models/RepairCandidate';

export class ExactFilenameStrategy implements PlaylistRepairStrategy {
  readonly name = 'ExactFilename';

  evaluate(
    entry: LibraryResolvedPlaylistEntry,
    candidate: LibrarySongRecord
  ): RepairCandidate | null {
    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const targetFilename = basename(rawLocation);
    const candidateFilename = basename(candidate.path);

    if (!targetFilename || !candidateFilename) return null;

    if (targetFilename.toLowerCase() === candidateFilename.toLowerCase()) {
      return {
        song: candidate,
        confidence: 95,
        strategyName: this.name,
        reason: `Matched exact filename: ${candidateFilename}`
      };
    }

    return null;
  }
}
