import { basename, extname } from 'path';

import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { PlaylistRepairStrategy } from '../interfaces/PlaylistRepairStrategy';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairCandidate } from '../models/RepairCandidate';

export class TitleMatchStrategy implements PlaylistRepairStrategy {
  readonly name = 'TitleMatch';

  evaluate(
    entry: LibraryResolvedPlaylistEntry,
    candidate: LibrarySongRecord
  ): RepairCandidate | null {
    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const targetFilename = basename(rawLocation);
    const ext = extname(targetFilename);
    const nameWithoutExt = ext ? targetFilename.slice(0, -ext.length) : targetFilename;
    const cleanTargetTitle = nameWithoutExt
      .replace(/^\d+[\s._-]+/, '')
      .trim()
      .toLowerCase();

    const candidateTitle = (candidate.title || basename(candidate.path, extname(candidate.path)))
      .replace(/^\d+[\s._-]+/, '')
      .trim()
      .toLowerCase();

    if (!cleanTargetTitle || !candidateTitle) return null;

    if (
      cleanTargetTitle === candidateTitle ||
      candidate.path.toLowerCase().includes(cleanTargetTitle)
    ) {
      return {
        song: candidate,
        confidence: 80,
        strategyName: this.name,
        reason: `Matched title metadata: '${candidate.title || candidateTitle}'`
      };
    }

    return null;
  }
}
