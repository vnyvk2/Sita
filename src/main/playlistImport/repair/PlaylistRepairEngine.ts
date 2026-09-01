import { basename } from 'path';

import type { LibraryCandidateProvider } from '../interfaces/LibraryCandidateProvider';
import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { LibraryResolvedPlaylist } from '../models/LibraryResolvedPlaylist';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { RepairCandidate } from '../models/RepairCandidate';
import type { RepairDiagnostic } from '../models/RepairDiagnostic';
import type { RepairStrategyRegistry } from '../registry/RepairStrategyRegistry';

export class PlaylistRepairEngine {
  constructor(
    private registry: RepairStrategyRegistry,
    private candidateProvider: LibraryCandidateProvider
  ) {}

  async repairPlaylist(playlist: LibraryResolvedPlaylist): Promise<LibraryResolvedPlaylist> {
    const repairedEntries: LibraryResolvedPlaylistEntry[] = [];

    if (this.candidateProvider.getCandidatesForFilenames) {
      const filenames: string[] = [];
      for (const entry of playlist.entries) {
        if (entry.trackReference.libraryMatch.status !== 'MATCHED') {
          const rawLocation =
            entry.trackReference.resolvedTrack.resolution.resolvedPath ??
            entry.trackReference.resolvedTrack.track.originalLocation;
          const targetFilename = basename(rawLocation);
          if (targetFilename) {
            filenames.push(targetFilename);
          }
        }
      }

      const candidatesMap = await this.candidateProvider.getCandidatesForFilenames(filenames);

      for (const entry of playlist.entries) {
        const repairedEntry = this.repairEntryWithCandidatesMap(entry, candidatesMap);
        repairedEntries.push(repairedEntry);
      }
    } else {
      for (const entry of playlist.entries) {
        const repairedEntry = await this.repairEntry(entry);
        repairedEntries.push(repairedEntry);
      }
    }

    return {
      ...playlist,
      entries: repairedEntries
    };
  }

  private repairEntryWithCandidatesMap(
    entry: LibraryResolvedPlaylistEntry,
    candidatesMap: Map<string, LibrarySongRecord[]>
  ): LibraryResolvedPlaylistEntry {
    if (entry.trackReference.libraryMatch.status === 'MATCHED') {
      return entry;
    }

    const rawLocation =
      entry.trackReference.resolvedTrack.resolution.resolvedPath ??
      entry.trackReference.resolvedTrack.track.originalLocation;

    const targetFilename = basename(rawLocation);
    if (!targetFilename) return entry;

    const candidates = candidatesMap.get(targetFilename) || [];
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

  async repairEntry(entry: LibraryResolvedPlaylistEntry): Promise<LibraryResolvedPlaylistEntry> {
    // Attempt repair for any entry that is not already matched to a song in the library
    if (entry.trackReference.libraryMatch.status === 'MATCHED') {
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
