import type { ImportStatistics } from './ImportStatistics';
import type { ImportWarning } from './ImportWarning';
import type { PlaylistImportPlanEntry } from './PlaylistImportPlanEntry';

export interface PlaylistImportPlan {
  playlistName: string;
  description?: string;
  entries: PlaylistImportPlanEntry[];
  statistics: ImportStatistics;
  warnings: ImportWarning[];
  sourceFormat?: string;
  sourceFile?: string;
  createdByImporter?: string;
}
