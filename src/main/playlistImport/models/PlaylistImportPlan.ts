import type { PlaylistImportPlanEntry } from './PlaylistImportPlanEntry';
import type { ImportStatistics } from './ImportStatistics';
import type { ImportWarning } from './ImportWarning';

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
