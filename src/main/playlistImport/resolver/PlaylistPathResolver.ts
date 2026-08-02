import { dirname, isAbsolute, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { ImportedPlaylist } from '../models/ImportedPlaylist';
import type { ResolvedPlaylist } from '../models/ResolvedPlaylist';
import type { ResolvedPlaylistEntry } from '../models/ResolvedPlaylistEntry';
import type { PathResolutionResult } from '../models/PathResolutionResult';

export class PlaylistPathResolver {
  resolvePlaylist(playlist: ImportedPlaylist, playlistFilePath: string): ResolvedPlaylist {
    const playlistDir = dirname(playlistFilePath);
    const resolvedEntries: ResolvedPlaylistEntry[] = [];

    for (const entry of playlist.entries) {
      const resolution = this.resolvePath(entry.track.originalLocation, playlistDir);

      resolvedEntries.push({
        position: entry.position,
        sourceLine: entry.sourceLine,
        dateAdded: entry.dateAdded,
        comments: entry.comments,
        resolvedTrack: {
          track: entry.track,
          resolution
        }
      });
    }

    return {
      name: playlist.name,
      description: playlist.description,
      entries: resolvedEntries,
      sourceFormat: playlist.sourceFormat,
      sourceFile: playlist.sourceFile,
      createdByImporter: playlist.createdByImporter
    };
  }

  resolvePath(originalReference: string, baseDir: string): PathResolutionResult {
    let candidatePath = originalReference.trim();

    // Check if it's a Windows drive letter (e.g. C:\ or D:/)
    const isWindowsDrive = /^[a-zA-Z]:[\\/]/.test(candidatePath);

    // Check for non-filesystem custom schemes (e.g. spotify:track:..., http://...)
    if (!isWindowsDrive && /^[a-z0-9+-.]+:/i.test(candidatePath) && !candidatePath.toLowerCase().startsWith('file://')) {
      return {
        originalReference,
        resolutionStatus: 'UNRESOLVED',
        verificationStatus: 'UNVERIFIED',
        diagnostics: [`Non-filesystem URI scheme detected: ${candidatePath}`]
      };
    }

    // Handle file:// URIs
    if (candidatePath.toLowerCase().startsWith('file://')) {
      try {
        candidatePath = fileURLToPath(candidatePath);
      } catch {
        return {
          originalReference,
          resolutionStatus: 'INVALID_URI',
          verificationStatus: 'UNVERIFIED',
          diagnostics: [`Failed to parse file URI: ${originalReference}`]
        };
      }
    }

    // Decode URI percent-encoded sequences (e.g. %20 -> space) if present
    if (candidatePath.includes('%')) {
      try {
        candidatePath = decodeURIComponent(candidatePath);
      } catch {
        // Ignore malformed percent sequences
      }
    }

    // Determine normalized filesystem target path
    const resolvedTarget = isAbsolute(candidatePath)
      ? normalize(candidatePath)
      : normalize(resolve(baseDir, candidatePath));

    return {
      originalReference,
      resolvedPath: resolvedTarget,
      resolutionStatus: 'RESOLVED',
      verificationStatus: 'UNVERIFIED'
    };
  }
}
