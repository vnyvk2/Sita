import type { PlaylistFormat } from '../constants/PlaylistFormats';
import type { ImportedPlaylist } from './ImportedPlaylist';
import type { PlaylistImportWarning } from './PlaylistImportWarning';

export interface PlaylistImportResult {
  playlist: ImportedPlaylist;
  warnings: PlaylistImportWarning[];
  importerId: string;
  format: PlaylistFormat;
}
