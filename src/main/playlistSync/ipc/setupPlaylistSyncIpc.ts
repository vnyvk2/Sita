import { ipcMain } from 'electron';
import type { PlaylistSyncWorkflow } from '../workflow/PlaylistSyncWorkflow';
import type { PlaylistLink } from '../models/PlaylistLink';
import type { PlaylistSyncPlan } from '../models/PlaylistSyncPlan';

export function setupPlaylistSyncIpc(workflow: PlaylistSyncWorkflow): void {
  ipcMain.handle(
    'playlistSync:preview',
    async (_event, link: PlaylistLink, currentPlaylistSongIds: number[]) => {
      return await workflow.previewSync(link, currentPlaylistSongIds);
    }
  );

  ipcMain.handle(
    'playlistSync:execute',
    async (_event, plan: PlaylistSyncPlan) => {
      return await workflow.executeSyncPlan(plan);
    }
  );
}
