import type { PluginCapability } from '../models/PluginCapability';
import type { PlaylistPlugin } from '../interfaces/PlaylistPlugin';
import type { ImportProvider } from '../providers/ImportProvider';
import type { SyncProvider } from '../providers/SyncProvider';
import type { MatchProvider } from '../providers/MatchProvider';

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

  getImportProviders(): ImportProvider[] {
    return this.getProviders('IMPORT_PROVIDER')
      .map((p) => p.importProvider)
      .filter((provider): provider is ImportProvider => provider !== undefined);
  }

  getSyncProviders(): SyncProvider[] {
    return this.getProviders('SYNC_PROVIDER')
      .map((p) => p.syncProvider)
      .filter((provider): provider is SyncProvider => provider !== undefined);
  }

  getMatchProviders(): MatchProvider[] {
    return this.getProviders('MATCH_PROVIDER')
      .map((p) => p.matchProvider)
      .filter((provider): provider is MatchProvider => provider !== undefined);
  }
}
