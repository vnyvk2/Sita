import type { ImportedPlaylist } from './ImportedPlaylist';
import type { PlaylistImportWarning } from './PlaylistImportWarning';
import type { PlaylistFormat } from '../constants/PlaylistFormats';

export interface PlaylistImportResult {
  playlist: ImportedPlaylist;
  warnings: PlaylistImportWarning[];
  importerId: string;
  format: PlaylistFormat;
}
