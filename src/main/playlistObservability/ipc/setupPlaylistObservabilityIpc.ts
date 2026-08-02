import { ipcMain } from 'electron';
import type { PlaylistObservabilityService } from '../services/PlaylistObservabilityService';

export function setupPlaylistObservabilityIpc(
  observabilityService: PlaylistObservabilityService
): void {
  ipcMain.handle('playlistObservability:metrics', async () => {
    return observabilityService.getMetrics();
  });

  ipcMain.handle('playlistObservability:timeline', async (_event, correlationId: string) => {
    return observabilityService.getTimeline(correlationId);
  });

  ipcMain.handle('playlistObservability:diagnostics', async () => {
    return observabilityService.getDiagnostics();
  });

  ipcMain.handle('playlistObservability:health', async () => {
    return observabilityService.getHealth();
  });

  ipcMain.handle('playlistObservability:snapshot', async () => {
    return observabilityService.getSnapshot();
  });
}
