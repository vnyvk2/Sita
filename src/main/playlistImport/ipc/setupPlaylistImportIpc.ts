import { ipcMain } from 'electron';
import type { PlaylistImportWorkflow } from '../workflow/PlaylistImportWorkflow';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportOptions } from '../interfaces/PlaylistImporter';

export function setupPlaylistImportIpc(workflow: PlaylistImportWorkflow): void {
  ipcMain.handle(
    'playlistImport:preview',
    async (_event, filePath: string, options?: PlaylistImportOptions) => {
      return await workflow.createPlanFromFile(filePath, options);
    }
  );

  ipcMain.handle(
    'playlistImport:execute',
    async (_event, plan: PlaylistImportPlan) => {
      return await workflow.executePlan(plan);
    }
  );
}
