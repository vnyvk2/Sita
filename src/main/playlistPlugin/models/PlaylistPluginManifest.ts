import type { PluginCapability } from './PluginCapability';

export interface PlaylistPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  minimumApiVersion: string;
  capabilities: PluginCapability[];
}
