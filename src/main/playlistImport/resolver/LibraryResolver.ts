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

    if (resolution.verificationStatus === 'MISSING') {
      return {
        position: entry.position,
        sourceLine: entry.sourceLine,
        dateAdded: entry.dateAdded,
        comments: entry.comments,
        trackReference: {
          resolvedTrack: entry.resolvedTrack,
          libraryMatch: {
            status: 'MISSING',
            confidence: 0,
            diagnostics: ['File is missing from filesystem']
          }
        }
      };
    }

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

    if (resolution.resolutionStatus === 'RESOLVED' && resolution.resolvedPath) {
      const matchedSong = await this.libraryLookup.findByCanonicalPath(resolution.resolvedPath);

      if (matchedSong) {
        const match: LibraryMatch = {
          matchedSongId: matchedSong.id,
          status: 'MATCHED',
          confidence: 100,
          candidates: [matchedSong]
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
      } else {
        const match: LibraryMatch = {
          status: 'NOT_IN_LIBRARY',
          confidence: 0,
          diagnostics: [`File exists at ${resolution.resolvedPath} but is not present in Nora library`]
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

    return {
      position: entry.position,
      sourceLine: entry.sourceLine,
      dateAdded: entry.dateAdded,
      comments: entry.comments,
      trackReference: {
        resolvedTrack: entry.resolvedTrack,
        libraryMatch: {
          status: 'UNVERIFIED',
          confidence: 0
        }
      }
    };
  }
}
