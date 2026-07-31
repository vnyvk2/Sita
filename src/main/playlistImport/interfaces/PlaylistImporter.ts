import type { PlaylistImportResult } from '../models/PlaylistImportResult';
import type { PlaylistImportContext } from './PlaylistImportContext';

export type PlaylistImportOptions = Record<string, unknown>;

export interface PlaylistImporter {
  readonly id: string;
  readonly name: string;
  readonly supportedExtensions: readonly string[];
  readonly supportedMimeTypes?: readonly string[];

  parse(context: PlaylistImportContext): Promise<PlaylistImportResult>;
}
