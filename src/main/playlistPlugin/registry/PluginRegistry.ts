import type { PluginCapability } from '../models/PluginCapability';
import type { PlaylistPlugin } from '../interfaces/PlaylistPlugin';

export class PluginRegistry {
  private providers = new Map<PluginCapability, Set<PlaylistPlugin>>();

  registerProvider(capability: PluginCapability, plugin: PlaylistPlugin): void {
    const list = this.providers.get(capability) ?? new Set();
    list.add(plugin);
    this.providers.set(capability, list);
  }

  unregisterProvider(capability: PluginCapability, plugin: PlaylistPlugin): void {
    const list = this.providers.get(capability);
    if (list) {
      list.delete(plugin);
    }
  }

  getProviders(capability: PluginCapability): PlaylistPlugin[] {
    const list = this.providers.get(capability);
    return list ? Array.from(list) : [];
  }
}
