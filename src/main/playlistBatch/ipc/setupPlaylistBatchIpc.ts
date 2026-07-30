import { ipcMain } from 'electron';
import type { PlaylistBatchOrchestrator } from '../orchestrator/PlaylistBatchOrchestrator';
import type { PlaylistBatchPlanner } from '../planner/PlaylistBatchPlanner';
import type { BatchItem } from '../models/BatchItem';
import type { BatchExecutionPolicy } from '../models/BatchExecutionPolicy';
import type { BatchExecutionPlan } from '../models/BatchExecutionPlan';

export function setupPlaylistBatchIpc(
  planner: PlaylistBatchPlanner,
  orchestrator: PlaylistBatchOrchestrator
): void {
  ipcMain.handle(
    'playlistBatch:create',
    async (_event, items: BatchItem[], policy?: BatchExecutionPolicy) => {
      return planner.createBatchPlan(items, policy);
    }
  );

  ipcMain.handle('playlistBatch:execute', async (_event, plan: BatchExecutionPlan) => {
    return orchestrator.executeBatchPlan(plan);
  });

  ipcMain.handle('playlistBatch:pause', async (_event, sessionId: string) => {
    return orchestrator.pauseSession(sessionId);
  });

  ipcMain.handle('playlistBatch:resume', async (_event, sessionId: string) => {
    return orchestrator.resumeSession(sessionId);
  });

  ipcMain.handle('playlistBatch:cancel', async (_event, sessionId: string) => {
    return orchestrator.cancelSession(sessionId);
  });

  ipcMain.handle('playlistBatch:status', async (_event, sessionId: string) => {
    return orchestrator.getSession(sessionId);
  });
}
