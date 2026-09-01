import { ipcMain } from 'electron';

import type { PluginManager } from '../manager/PluginManager';
import type { PluginCapability } from '../models/PluginCapability';
import type { PluginRegistry } from '../registry/PluginRegistry';

export function setupPlaylistPluginIpc(manager: PluginManager, registry: PluginRegistry): void {
  ipcMain.handle('plugin:list', async () => {
    return manager.listPlugins();
  });

  ipcMain.handle('plugin:enable', async (_event, pluginId: string) => {
    return await manager.activatePlugin(pluginId);
  });

  ipcMain.handle('plugin:disable', async (_event, pluginId: string) => {
    return await manager.deactivatePlugin(pluginId);
  });

  ipcMain.handle('plugin:capabilities', async (_event, capability: PluginCapability) => {
    const providers = registry.getProviders(capability);
    return providers.map((p) => p.manifest);
  });
}
