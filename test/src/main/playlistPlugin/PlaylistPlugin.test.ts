import { describe, it, expect, vi } from 'vitest';
import { PluginRegistry } from '@main/playlistPlugin/registry/PluginRegistry';
import { PluginManager } from '@main/playlistPlugin/manager/PluginManager';
import { PlaylistEventBus } from '@main/playlistAutomation/events/PlaylistEventBus';
import type { PlaylistPlugin } from '@main/playlistPlugin/interfaces/PlaylistPlugin';
import type { PluginContext } from '@main/playlistPlugin/context/PluginContext';

describe('Phase 16 — Plugin & Extension Framework', () => {
  it('should register, activate, and route capabilities for an external plugin', async () => {
    const registry = new PluginRegistry();
    const eventBus = new PlaylistEventBus();
    const manager = new PluginManager(registry, eventBus);

    let activatedContext: PluginContext | null = null;

    const mockSpotifyPlugin: PlaylistPlugin = {
      manifest: {
        id: 'com.nora.plugin.spotify',
        name: 'Spotify Integration',
        version: '1.0.0',
        description: 'Imports and synchronizes playlists with Spotify API',
        minimumApiVersion: '1.0.0',
        capabilities: ['IMPORT_PROVIDER', 'SYNC_PROVIDER']
      },
      activate: vi.fn(async (ctx: PluginContext) => {
        activatedContext = ctx;
        ctx.log('Spotify plugin activated');
      }),
      deactivate: vi.fn(async () => {})
    };

    manager.registerPlugin(mockSpotifyPlugin);
    const initialList = manager.listPlugins();
    expect(initialList).toHaveLength(1);
    expect(initialList[0].status).toBe('DISCOVERED');

    const activated = await manager.activatePlugin('com.nora.plugin.spotify');
    expect(activated).toBe(true);

    const activeInfo = manager.getPluginInfo('com.nora.plugin.spotify');
    expect(activeInfo?.status).toBe('RUNNING');
    expect(activatedContext).not.toBeNull();

    const importProviders = registry.getProviders('IMPORT_PROVIDER');
    expect(importProviders).toHaveLength(1);
    expect(importProviders[0].manifest.id).toBe('com.nora.plugin.spotify');

    const deactivated = await manager.deactivatePlugin('com.nora.plugin.spotify');
    expect(deactivated).toBe(true);

    const postDeactivateProviders = registry.getProviders('IMPORT_PROVIDER');
    expect(postDeactivateProviders).toHaveLength(0);
  });
});
