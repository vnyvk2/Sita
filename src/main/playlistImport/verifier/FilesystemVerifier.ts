import type { FileSystemAccess } from '../interfaces/FileSystemAccess';
import type { PathResolutionResult } from '../models/PathResolutionResult';
import type { ResolvedPlaylist } from '../models/ResolvedPlaylist';
import type { ResolvedPlaylistEntry } from '../models/ResolvedPlaylistEntry';

export class FilesystemVerifier {
  constructor(private fileSystem: FileSystemAccess) {}

  async verifyPlaylist(playlist: ResolvedPlaylist): Promise<ResolvedPlaylist> {
    const verifiedEntries: ResolvedPlaylistEntry[] = [];

    for (const entry of playlist.entries) {
      const verifiedResolution = await this.verifyResolution(entry.resolvedTrack.resolution);

      verifiedEntries.push({
        ...entry,
        resolvedTrack: {
          ...entry.resolvedTrack,
          resolution: verifiedResolution
        }
      });
    }

    return {
      ...playlist,
      entries: verifiedEntries
    };
  }

  async verifyResolution(resolution: PathResolutionResult): Promise<PathResolutionResult> {
    if (resolution.resolutionStatus !== 'RESOLVED' || !resolution.resolvedPath) {
      return resolution;
    }

    const exists = await this.fileSystem.exists(resolution.resolvedPath);

    return {
      ...resolution,
      verificationStatus: exists ? 'FOUND' : 'MISSING'
    };
  }
}
