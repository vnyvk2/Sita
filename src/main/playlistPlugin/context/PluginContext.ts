import type { PlaylistEventBus } from '../../playlistAutomation/events/PlaylistEventBus';

export interface PluginContext {
  pluginId: string;
  eventBus: PlaylistEventBus;
  log(message: string): void;
  store: Map<string, unknown>;
}
