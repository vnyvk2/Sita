import { describe, it, expect, vi } from 'vitest';
import { PluginRegistry } from '@main/playlistPlugin/registry/PluginRegistry';
import { PluginManager } from '@main/playlistPlugin/manager/PluginManager';
import { PlaylistEventBus } from '@main/playlistAutomation/events/PlaylistEventBus';
import type { PlaylistPlugin } from '@main/playlistPlugin/interfaces/PlaylistPlugin';
import type { PluginContext } from '@main/playlistPlugin/context/PluginContext';
import type { ImportProvider } from '@main/playlistPlugin/providers/ImportProvider';

describe('Phase 16 — Plugin & Extension Framework Refinements', () => {
  it('should register, activate, and route typed providers for a versioned external plugin', async () => {
    const registry = new PluginRegistry();
    const eventBus = new PlaylistEventBus();
    const manager = new PluginManager(registry, eventBus);

    let activatedContext: PluginContext | null = null;

    const mockImportProvider: ImportProvider = {
      format: 'spotify',
      parseAndPlan: vi.fn(async () => ({} as any))
    };

    const mockSpotifyPlugin: PlaylistPlugin = {
      manifest: {
        id: 'com.nora.plugin.spotify',
        name: 'Spotify Integration',
        version: '1.0.0',
        description: 'Imports and synchronizes playlists with Spotify API',
        minimumApiVersion: '1.0.0',
        capabilities: ['IMPORT_PROVIDER', 'SYNC_PROVIDER']
      },
      importProvider: mockImportProvider,
      activate: vi.fn(async (ctx: PluginContext) => {
        activatedContext = ctx;
        ctx.log('Spotify plugin activated');
      }),
      deactivate: vi.fn(async () => {})
    };

    manager.registerPlugin(mockSpotifyPlugin);
    const activated = await manager.activatePlugin('com.nora.plugin.spotify');
    expect(activated).toBe(true);

    expect(activatedContext).not.toBeNull();
    expect(activatedContext?.apiVersion).toBe('1.0.0');

    const importProviders = registry.getImportProviders();
    expect(importProviders).toHaveLength(1);
    expect(importProviders[0].format).toBe('spotify');

    const deactivated = await manager.deactivatePlugin('com.nora.plugin.spotify');
    expect(deactivated).toBe(true);

    expect(registry.getImportProviders()).toHaveLength(0);
  });
});
