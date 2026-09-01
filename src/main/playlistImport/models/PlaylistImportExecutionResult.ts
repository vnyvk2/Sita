import type { ImportWarning } from './ImportWarning';
import type { PlaylistImportExecutionStatistics } from './PlaylistImportExecutionStatistics';

export interface PlaylistImportExecutionResult {
  playlistId: number;
  playlistName: string;
  success: boolean;
  importedSongIds: number[];
  statistics: PlaylistImportExecutionStatistics;
  warnings: ImportWarning[];
}
