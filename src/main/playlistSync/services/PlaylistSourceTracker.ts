import { createHash } from 'crypto';
import type { FileSystemAccess } from '../../playlistImport/interfaces/FileSystemAccess';
import type { PlaylistLink } from '../models/PlaylistLink';

export class PlaylistSourceTracker {
  constructor(private fileSystem: FileSystemAccess) {}

  async computeSourceHash(filePath: string): Promise<string | null> {
    try {
      if (!this.fileSystem.readFile) return null;
      const content = await this.fileSystem.readFile(filePath);
      return createHash('md5').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  async hasSourceChanged(link: PlaylistLink): Promise<boolean> {
    const exists = await this.fileSystem.exists(link.sourceFile);
    if (!exists) return false;

    if (!link.fileHash) return true;

    const currentHash = await this.computeSourceHash(link.sourceFile);
    if (!currentHash) return false;

    return currentHash !== link.fileHash;
  }
}
