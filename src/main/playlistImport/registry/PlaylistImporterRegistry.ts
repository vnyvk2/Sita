import type { PlaylistImporter } from '../interfaces/PlaylistImporter';

export class PlaylistImporterRegistry {
  private importers: Map<string, PlaylistImporter> = new Map();

  register(importer: PlaylistImporter): void {
    if (this.importers.has(importer.id)) {
      throw new Error(`Importer with id ${importer.id} is already registered.`);
    }
    this.importers.set(importer.id, importer);
  }

  unregister(importerId: string): void {
    this.importers.delete(importerId);
  }

  resolveById(id: string): PlaylistImporter | undefined {
    return this.importers.get(id);
  }

  resolveByExtension(extension: string): PlaylistImporter | undefined {
    const ext = extension.toLowerCase();
    for (const importer of this.importers.values()) {
      if (importer.supportedExtensions.some((supportedExt) => supportedExt.toLowerCase() === ext)) {
        return importer;
      }
    }
    return undefined;
  }

  resolveByMimeType(mimeType: string): PlaylistImporter | undefined {
    const mime = mimeType.toLowerCase();
    for (const importer of this.importers.values()) {
      if (importer.supportedMimeTypes?.some((supportedMime) => supportedMime.toLowerCase() === mime)) {
        return importer;
      }
    }
    return undefined;
  }
}
