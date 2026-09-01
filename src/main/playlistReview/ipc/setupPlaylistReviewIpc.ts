import { ipcMain } from 'electron';

import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import type { PlaylistImportWorkflow } from '../../playlistImport/workflow/PlaylistImportWorkflow';
import type { UserOverride } from '../models/UserOverride';
import type { PlaylistReviewService } from '../services/PlaylistReviewService';

export function setupPlaylistReviewIpc(
  reviewService: PlaylistReviewService,
  workflow: PlaylistImportWorkflow
): void {
  ipcMain.handle('playlistReview:create', async (_event, plan: PlaylistImportPlan) => {
    return reviewService.createSession(plan);
  });

  ipcMain.handle(
    'playlistReview:override',
    async (_event, sessionId: string, override: UserOverride) => {
      return reviewService.applyOverride(sessionId, override);
    }
  );

  ipcMain.handle('playlistReview:execute', async (_event, sessionId: string) => {
    const session = reviewService.getSession(sessionId);
    if (!session || !session.isValid) {
      throw new Error(`Cannot execute invalid or missing review session ${sessionId}`);
    }
    return await workflow.executePlan(session.effectivePlan);
  });
}
