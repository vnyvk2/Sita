import type { PluginContext } from '../context/PluginContext';
import type { PlaylistPluginManifest } from '../models/PlaylistPluginManifest';

export interface PlaylistPlugin {
  manifest: PlaylistPluginManifest;
  activate(context: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}
