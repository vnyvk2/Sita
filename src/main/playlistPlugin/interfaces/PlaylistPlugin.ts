import type { PluginContext } from '../context/PluginContext';
import type { PlaylistPluginManifest } from '../models/PlaylistPluginManifest';
import type { ImportProvider } from '../providers/ImportProvider';
import type { MatchProvider } from '../providers/MatchProvider';
import type { SyncProvider } from '../providers/SyncProvider';

export interface PlaylistPlugin {
  manifest: PlaylistPluginManifest;
  importProvider?: ImportProvider;
  syncProvider?: SyncProvider;
  matchProvider?: MatchProvider;
  activate(context: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}
