import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';

export interface ImportProvider {
  format: string;
  parseAndPlan(sourceFile: string): Promise<PlaylistImportPlan>;
}
