import { readFile } from 'fs/promises';
import { extname } from 'path';

import { UnsupportedFormatError, CorruptedPlaylistError } from '../errors/PlaylistImportError';
import type { FileSystemAccess } from '../interfaces/FileSystemAccess';
import type { PlaylistImportContext } from '../interfaces/PlaylistImportContext';
import type { PlaylistImportResult } from '../models/PlaylistImportResult';
import type { PlaylistImporterRegistry } from '../registry/PlaylistImporterRegistry';

export class PlaylistImportService {
  constructor(
    private registry: PlaylistImporterRegistry,
    private fileSystem?: FileSystemAccess
  ) {}

  async importPlaylist(
    filePath: string,
    options?: Record<string, unknown>
  ): Promise<PlaylistImportResult> {
    const ext = extname(filePath);
    const importer = this.registry.resolveByExtension(ext);

    if (!importer) {
      throw new UnsupportedFormatError(filePath);
    }

    let content: string;
    try {
      if (this.fileSystem?.readFile) {
        content = await this.fileSystem.readFile(filePath);
      } else {
        content = await readFile(filePath, 'utf-8');
      }
    } catch {
      throw new CorruptedPlaylistError(filePath);
    }

    const context: PlaylistImportContext = {
      filePath,
      content,
      options
    };

    return await importer.parse(context);
  }
}
