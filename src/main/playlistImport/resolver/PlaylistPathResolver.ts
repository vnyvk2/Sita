import { dirname, isAbsolute, normalize, resolve } from 'path';
import { stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import type { ImportedPlaylist } from '../models/ImportedPlaylist';
import type { ResolvedPlaylist } from '../models/ResolvedPlaylist';
import type { ResolvedPlaylistEntry } from '../models/ResolvedPlaylistEntry';
import type { PathResolutionResult } from '../models/PathResolutionResult';

export class PlaylistPathResolver {
  async resolvePlaylist(playlist: ImportedPlaylist, playlistFilePath: string): Promise<ResolvedPlaylist> {
    const playlistDir = dirname(playlistFilePath);
    const resolvedEntries: ResolvedPlaylistEntry[] = [];
    let foundCount = 0;
    let missingCount = 0;

    for (const entry of playlist.entries) {
      const resolution = await this.resolvePath(entry.track.originalLocation, playlistDir);

      if (resolution.status === 'FOUND') {
        foundCount++;
      } else {
        missingCount++;
      }

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
      createdByImporter: playlist.createdByImporter,
      foundCount,
      missingCount
    };
  }

  async resolvePath(originalReference: string, baseDir: string): Promise<PathResolutionResult> {
    let candidatePath = originalReference;

    // Handle file:// URIs
    if (candidatePath.toLowerCase().startsWith('file://')) {
      try {
        candidatePath = fileURLToPath(candidatePath);
      } catch (err) {
        return {
          originalReference,
          status: 'INVALID_URI',
          diagnostics: [`Failed to parse file URI: ${originalReference}`]
        };
      }
    }

    // Determine normalized filesystem target path
    const resolvedTarget = isAbsolute(candidatePath)
      ? normalize(candidatePath)
      : normalize(resolve(baseDir, candidatePath));

    // Check filesystem existence
    try {
      await stat(resolvedTarget);
      return {
        originalReference,
        resolvedPath: resolvedTarget,
        status: 'FOUND'
      };
    } catch {
      return {
        originalReference,
        resolvedPath: resolvedTarget,
        status: 'MISSING'
      };
    }
  }
}
