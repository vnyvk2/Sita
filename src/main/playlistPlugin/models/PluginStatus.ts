import type { PlaylistPluginManifest } from './PlaylistPluginManifest';

export type PluginStatus = 'DISCOVERED' | 'VALIDATED' | 'RUNNING' | 'DISABLED' | 'FAILED';

export interface PluginInfo {
  manifest: PlaylistPluginManifest;
  status: PluginStatus;
  loadedAt?: Date;
  error?: string;
}
