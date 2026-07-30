import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { PlaylistImporterRegistry } from '../registry/PlaylistImporterRegistry';
import type { PlaylistImportResult } from '../models/PlaylistImportResult';
import type { PlaylistImportContext } from '../interfaces/PlaylistImportContext';
import { UnsupportedFormatError, CorruptedPlaylistError } from '../errors/PlaylistImportError';

export class PlaylistImportService {
  private registry: PlaylistImporterRegistry;

  constructor(registry: PlaylistImporterRegistry) {
    this.registry = registry;
  }

  async importPlaylist(filePath: string, options?: Record<string, unknown>): Promise<PlaylistImportResult> {
    const ext = extname(filePath);
    const importer = this.registry.resolveByExtension(ext);

    if (!importer) {
      throw new UnsupportedFormatError(filePath);
    }

    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err) {
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
