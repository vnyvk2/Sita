import { ipcMain } from 'electron';

import type { PlaylistImportIpcOptions } from '../../../common/collections/types';
import importPlaylist, { analyzePlaylistImport } from '../../core/importPlaylist';
import type { PlaylistImportOptions } from '../interfaces/PlaylistImporter';
import type { PlaylistImportPlan } from '../models/PlaylistImportPlan';
import type { PlaylistImportHistoryService } from '../services/PlaylistImportHistoryService';
import type { PlaylistImportWorkflow } from '../workflow/PlaylistImportWorkflow';

export function setupPlaylistImportIpc(
  workflow: PlaylistImportWorkflow,
  historyService?: PlaylistImportHistoryService
): void {
  ipcMain.handle('collections/analyze', async (_, filePath?: string) => {
    return await analyzePlaylistImport(workflow, filePath);
  });

  ipcMain.handle('collections/import', async (_, options?: PlaylistImportIpcOptions) => {
    return await importPlaylist(workflow, options);
  });

  ipcMain.handle(
    'playlistImport:preview',
    async (_event, filePath: string, options?: PlaylistImportOptions) => {
      return await workflow.createPlanFromFile(filePath, options);
    }
  );

  ipcMain.handle('playlistImport:execute', async (_event, plan: PlaylistImportPlan) => {
    return await workflow.executePlan(plan);
  });

  if (historyService) {
    ipcMain.handle('playlistImport:history', async () => {
      return await historyService.listHistory();
    });

    ipcMain.handle('playlistImport:undo', async (_event, sessionId: string) => {
      return await historyService.undoImport(sessionId);
    });

    ipcMain.handle('playlistImport:replay', async (_event, sessionId: string) => {
      return await historyService.replayImport(sessionId, workflow);
    });
  }
}
