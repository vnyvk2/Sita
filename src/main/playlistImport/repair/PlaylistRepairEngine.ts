import { basename } from 'path';
import type { LibraryCandidateProvider } from '../interfaces/LibraryCandidateProvider';
import type { RepairStrategyRegistry } from '../registry/RepairStrategyRegistry';
import type { LibraryResolvedPlaylist } from '../models/LibraryResolvedPlaylist';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairCandidate } from '../models/RepairCandidate';
import type { RepairDiagnostic } from '../models/RepairDiagnostic';

export class PlaylistRepairEngine {
  constructor(
    private registry: RepairStrategyRegistry,
    private candidateProvider: LibraryCandidateProvider
  ) {}

  async repairPlaylist(playlist: LibraryResolvedPlaylist): Promise<LibraryResolvedPlaylist> {
    const repairedEntries: LibraryResolvedPlaylistEntry[] = [];

    for (const entry of playlist.entries) {
      const repairedEntry = await this.repairEntry(entry);
      repairedEntries.push(repairedEntry);
    }

    return {
      ...playlist,
      entries: repairedEntries
    };
  }

  async repairEntry(entry: LibraryResolvedPlaylistEntry): Promise<LibraryResolvedPlaylistEntry> {
    // Only attempt repair for unresolved library entries (NOT_IN_LIBRARY)
    if (entry.trackReference.libraryMatch.status !== 'NOT_IN_LIBRARY') {
      return entry;
    }

    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const targetFilename = basename(rawLocation);
    if (!targetFilename) return entry;

    const candidates = await this.candidateProvider.getCandidatesForFilename(targetFilename);
    if (candidates.length === 0) return entry;

    const strategies = this.registry.getStrategies();
    let bestCandidate: RepairCandidate | null = null;

    for (const candidateSong of candidates) {
      for (const strategy of strategies) {
        const result = strategy.evaluate(entry, candidateSong);

        if (result && (!bestCandidate || result.confidence > bestCandidate.confidence)) {
          bestCandidate = result;
        }
      }
    }

    if (bestCandidate) {
      const diagnostic: RepairDiagnostic = {
        strategyName: bestCandidate.strategyName,
        confidence: bestCandidate.confidence,
        reason: bestCandidate.reason,
        candidateCount: candidates.length
      };

      return {
        ...entry,
        trackReference: {
          ...entry.trackReference,
          libraryMatch: {
            matchedSongId: bestCandidate.song.id,
            status: 'MATCHED',
            matchType: 'REPAIRED',
            confidence: bestCandidate.confidence,
            candidates: [bestCandidate.song],
            diagnostics: [diagnostic]
          }
        }
      };
    }

    return entry;
  }
}
