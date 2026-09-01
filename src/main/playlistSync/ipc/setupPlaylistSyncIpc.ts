import { ipcMain } from 'electron';

import type { PlaylistLink } from '../models/PlaylistLink';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';
import type { PlaylistSyncWorkflow } from '../workflow/PlaylistSyncWorkflow';

export function setupPlaylistSyncIpc(workflow: PlaylistSyncWorkflow): void {
  ipcMain.handle(
    'playlistSync:preview',
    async (_event, link: PlaylistLink, currentPlaylistSongIds: number[]) => {
      return await workflow.previewSync(link, currentPlaylistSongIds);
    }
  );

  ipcMain.handle('playlistSync:execute', async (_event, plan: PlaylistSyncPlan) => {
    return await workflow.executeSyncPlan(plan);
  });
}
