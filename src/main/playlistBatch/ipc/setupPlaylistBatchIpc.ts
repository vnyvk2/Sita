import { ipcMain } from 'electron';

import type { BatchImportProgressPayload } from '../../../common/collections/types';
import { sendMessageToRenderer } from '../../main';
import type { BatchExecutionPlan } from '../models/BatchExecutionPlan';
import type { BatchExecutionPolicy } from '../models/BatchExecutionPolicy';
import type { BatchExecutionSummary } from '../models/BatchExecutionSummary';
import type { BatchItem } from '../models/BatchItem';
import type { PlaylistBatchOrchestrator } from '../orchestrator/PlaylistBatchOrchestrator';
import type { PlaylistBatchPlanner } from '../planner/PlaylistBatchPlanner';

export async function executePlaylistBatch(
  planner: PlaylistBatchPlanner,
  orchestrator: PlaylistBatchOrchestrator,
  filePaths: string[],
  sendProgressToRenderer?: (channel: string, ...args: any[]) => void
): Promise<BatchExecutionSummary> {
  if (!filePaths || filePaths.length === 0) {
    throw new Error('No playlist files provided for batch import.');
  }

  const items: BatchItem[] = filePaths.map((filePath, index) => ({
    id: `batch_item_${Date.now()}_${index}`,
    action: 'IMPORT',
    sourceFile: filePath,
    status: 'PENDING',
    dependencies: []
  }));

  const plan = planner.createBatchPlan(items);

  try {
    const summary = await orchestrator.executeBatchPlan(plan, {
      onProgress: (progress: BatchImportProgressPayload) => {
        sendProgressToRenderer?.('playlistBatch/progress', progress);
      }
    });

    if (summary.status === 'COMPLETED') {
      sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_BATCH_SUCCESS',
        data: {
          total: summary.totalPlaylists,
          imported: summary.successfulCount,
          songs: summary.importedSongsCount,
          skipped: summary.skippedCount,
          conflictNames: summary.conflictNames,
          failed: summary.failedCount
        }
      });
    } else if (summary.status === 'CANCELLED') {
      sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_BATCH_CANCELLED',
        data: {
          total: summary.totalPlaylists,
          imported: summary.successfulCount
        }
      });
    } else if (summary.status === 'FAILED') {
      sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_BATCH_FAILED',
        data: {
          total: summary.totalPlaylists,
          failed: summary.failedCount
        }
      });
    }

    return summary;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already in progress')) {
      sendMessageToRenderer({
        messageCode: 'PLAYLIST_IMPORT_BATCH_ALREADY_IN_PROGRESS'
      });
    }
    throw error;
  }
}

export function setupPlaylistBatchIpc(
  planner: PlaylistBatchPlanner,
  orchestrator: PlaylistBatchOrchestrator,
  sendProgressToRenderer?: (channel: string, ...args: any[]) => void
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

  // Collections Import Batch Endpoints
  ipcMain.handle('collections/import-batch', async (_event, filePaths: string[]) => {
    return await executePlaylistBatch(planner, orchestrator, filePaths, sendProgressToRenderer);
  });

  ipcMain.handle('collections/import-batch-cancel', async (_event, sessionId?: string) => {
    if (sessionId) {
      return orchestrator.cancelSession(sessionId);
    }
    return orchestrator.cancelActiveSession();
  });
}

