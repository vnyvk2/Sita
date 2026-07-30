import type { PluginRegistry } from '../registry/PluginRegistry';
import type { PlaylistEventBus } from '../../playlistAutomation/events/PlaylistEventBus';
import type { PlaylistPlugin } from '../interfaces/PlaylistPlugin';
import type { PluginContext } from '../context/PluginContext';
import type { PluginInfo } from '../models/PluginStatus';

export class PluginManager {
  private plugins = new Map<string, PlaylistPlugin>();
  private pluginInfos = new Map<string, PluginInfo>();
  private logs = new Map<string, string[]>();

  constructor(
    private registry: PluginRegistry,
    private eventBus: PlaylistEventBus
  ) {}

  registerPlugin(plugin: PlaylistPlugin): void {
    const { id } = plugin.manifest;
    this.plugins.set(id, plugin);
    this.pluginInfos.set(id, {
      manifest: plugin.manifest,
      status: 'DISCOVERED'
    });
    this.logs.set(id, []);
  }

  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    const info = this.pluginInfos.get(pluginId);
    if (!plugin || !info) return false;

    try {
      const context: PluginContext = {
        pluginId,
        eventBus: this.eventBus,
        log: (message: string) => {
          const logList = this.logs.get(pluginId) ?? [];
          logList.push(`[${new Date().toISOString()}] ${message}`);
        },
        store: new Map()
      };

      await plugin.activate(context);

      for (const capability of plugin.manifest.capabilities) {
        this.registry.registerProvider(capability, plugin);
      }

      info.status = 'RUNNING';
      info.loadedAt = new Date();
      return true;
    } catch (error) {
      info.status = 'FAILED';
      info.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    const info = this.pluginInfos.get(pluginId);
    if (!plugin || !info) return false;

    try {
      await plugin.deactivate();

      for (const capability of plugin.manifest.capabilities) {
        this.registry.unregisterProvider(capability, plugin);
      }

      info.status = 'DISABLED';
      return true;
    } catch (error) {
      info.status = 'FAILED';
      info.error = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  getPluginInfo(pluginId: string): PluginInfo | null {
    const info = this.pluginInfos.get(pluginId);
    return info ? { ...info } : null;
  }

  listPlugins(): PluginInfo[] {
    return Array.from(this.pluginInfos.values()).map((i) => ({ ...i }));
  }
}
