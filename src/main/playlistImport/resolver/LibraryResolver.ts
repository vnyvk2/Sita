import type { LibraryLookup } from '../interfaces/LibraryLookup';
import type { ResolvedPlaylist } from '../models/ResolvedPlaylist';
import type { ResolvedPlaylistEntry } from '../models/ResolvedPlaylistEntry';
import type { LibraryResolvedPlaylist } from '../models/LibraryResolvedPlaylist';
import type { LibraryResolvedPlaylistEntry } from '../models/LibraryResolvedPlaylistEntry';
import type { LibraryMatch } from '../models/LibraryMatch';

export class LibraryResolver {
  constructor(private libraryLookup: LibraryLookup) {}

  async resolvePlaylist(playlist: ResolvedPlaylist): Promise<LibraryResolvedPlaylist> {
    const entries: LibraryResolvedPlaylistEntry[] = [];

    for (const entry of playlist.entries) {
      const resolvedEntry = await this.resolveEntry(entry);
      entries.push(resolvedEntry);
    }

    return {
      name: playlist.name,
      description: playlist.description,
      entries,
      sourceFormat: playlist.sourceFormat,
      sourceFile: playlist.sourceFile,
      createdByImporter: playlist.createdByImporter
    };
  }

  async resolveEntry(entry: ResolvedPlaylistEntry): Promise<LibraryResolvedPlaylistEntry> {
    const { resolution } = entry.resolvedTrack;

    if (resolution.resolutionStatus === 'UNRESOLVED') {
      return {
        position: entry.position,
        sourceLine: entry.sourceLine,
        dateAdded: entry.dateAdded,
        comments: entry.comments,
        trackReference: {
          resolvedTrack: entry.resolvedTrack,
          libraryMatch: {
            status: 'UNRESOLVED',
            confidence: 0,
            diagnostics: resolution.diagnostics
          }
        }
      };
    }

    if (resolution.resolutionStatus === 'INVALID_URI') {
      return {
        position: entry.position,
        sourceLine: entry.sourceLine,
        dateAdded: entry.dateAdded,
        comments: entry.comments,
        trackReference: {
          resolvedTrack: entry.resolvedTrack,
          libraryMatch: {
            status: 'INVALID_URI',
            confidence: 0,
            diagnostics: resolution.diagnostics
          }
        }
      };
    }

    // Always attempt canonical library lookup regardless of filesystem existence status
    const targetPath = resolution.resolvedPath ?? entry.resolvedTrack.track.originalLocation;
    if (targetPath) {
      const matchedSong = await this.libraryLookup.findByCanonicalPath(targetPath);

      if (matchedSong) {
        const diagnostics: string[] = [];
        if (resolution.verificationStatus === 'MISSING') {
          diagnostics.push('File missing from original playlist filesystem location, but matched in Nora library');
        }

        const match: LibraryMatch = {
          matchedSongId: matchedSong.id,
          status: 'MATCHED',
          matchType: 'EXACT',
          confidence: 100,
          candidates: [matchedSong],
          diagnostics: diagnostics.length > 0 ? diagnostics : undefined
        };

        return {
          position: entry.position,
          sourceLine: entry.sourceLine,
          dateAdded: entry.dateAdded,
          comments: entry.comments,
          trackReference: {
            resolvedTrack: entry.resolvedTrack,
            libraryMatch: match
          }
        };
      }
    }

    // If canonical lookup fails, preserve filesystem verification status as diagnostic metadata for RepairEngine
    const status = resolution.verificationStatus === 'MISSING' ? 'MISSING' : 'NOT_IN_LIBRARY';
    const diagnostics =
      resolution.verificationStatus === 'MISSING'
        ? ['File is missing from filesystem and not found in Nora library']
        : [`File exists at ${targetPath} but is not present in Nora library`];

    return {
      position: entry.position,
      sourceLine: entry.sourceLine,
      dateAdded: entry.dateAdded,
      comments: entry.comments,
      trackReference: {
        resolvedTrack: entry.resolvedTrack,
        libraryMatch: {
          status,
          confidence: 0,
          diagnostics
        }
      }
    };
  }
}
