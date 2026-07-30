import type { PlaylistImportExecutionStatistics } from './PlaylistImportExecutionStatistics';
import type { ImportWarning } from './ImportWarning';

export interface PlaylistImportExecutionResult {
  playlistId: number;
  playlistName: string;
  success: boolean;
  importedSongIds: number[];
  statistics: PlaylistImportExecutionStatistics;
  warnings: ImportWarning[];
}
