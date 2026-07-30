import type { LibraryLookup } from '../interfaces/LibraryLookup';
import type { RepairStrategyRegistry } from '../registry/RepairStrategyRegistry';
import type { LibraryResolvedPlaylist } from '../models/LibraryResolvedPlaylist';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';

export class PlaylistRepairEngine {
  constructor(
    private registry: RepairStrategyRegistry,
    private libraryLookup: LibraryLookup
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

    const strategies = this.registry.getStrategies();

    for (const strategy of strategies) {
      const repairResult = await strategy.repair(entry, this.libraryLookup);

      if (repairResult?.repaired && repairResult.candidate) {
        const { candidate } = repairResult;

        return {
          ...entry,
          trackReference: {
            ...entry.trackReference,
            libraryMatch: {
              matchedSongId: candidate.song.id,
              status: 'MATCHED',
              confidence: candidate.confidence,
              candidates: repairResult.allCandidates?.map((c) => c.song) ?? [candidate.song],
              diagnostics: [
                `Repaired via strategy '${candidate.strategyName}' (confidence ${candidate.confidence}%): ${candidate.reason}`
              ]
            }
          }
        };
      }
    }

    return entry;
  }
}
