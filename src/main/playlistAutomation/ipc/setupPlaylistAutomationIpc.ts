import { ipcMain } from 'electron';
import type { PlaylistAutomationEngine } from '../engine/PlaylistAutomationEngine';

export function setupPlaylistAutomationIpc(engine: PlaylistAutomationEngine): void {
  ipcMain.handle('playlistAutomation:enable', async () => {
    engine.enable();
    return { success: true, enabled: true };
  });

  ipcMain.handle('playlistAutomation:disable', async () => {
    engine.disable();
    return { success: true, enabled: false };
  });

  ipcMain.handle('playlistAutomation:status', async () => {
    return { enabled: engine.isEnabled() };
  });

  ipcMain.handle('playlistAutomation:rules', async () => {
    return engine.getRules();
  });
}
