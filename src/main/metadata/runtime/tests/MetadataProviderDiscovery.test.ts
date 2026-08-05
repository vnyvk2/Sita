import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import { ProviderState } from '../../contracts/ProviderStatus';
import { MetadataProviderDiscovery } from '../MetadataProviderDiscovery';
import { MetadataProviderRegistry } from '../MetadataProviderRegistry';

const createAdapter = (id: string, capabilities: ProviderCapability[]): IMetadataProviderAdapter => ({
  identity: {
    id,
    name: `Adapter ${id}`,
    version: '1.0.0',
    providerType: 'online'
  },
  capabilities: new ProviderCapabilities(capabilities),
  status: { state: ProviderState.Uninitialized, consecutiveFailures: 0 },
  legacyInfo: {
    id,
    name: `Adapter ${id}`,
    version: '1.0.0',
    capabilities: new Set()
  },
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  supports: (cap) => capabilities.includes(cap),
  lookup: vi.fn().mockResolvedValue({ providerId: id, success: true }),
  search: vi.fn().mockResolvedValue([])
});

describe('Metadata Runtime — ProviderDiscovery & Registry', () => {
  it('registers factories, discovers adapters, and registers them into MetadataProviderRegistry', async () => {
    const registry = new MetadataProviderRegistry();
    const discovery = new MetadataProviderDiscovery(registry);

    discovery.registerFactory('musicbrainz', () =>
      createAdapter('musicbrainz', [ProviderCapability.Lookup, ProviderCapability.Relationships])
    );
    discovery.registerFactory('discogs', () =>
      createAdapter('discogs', [ProviderCapability.Search, ProviderCapability.Artwork])
    );

    const runtimes = await discovery.discoverAll();
    expect(runtimes.length).toBe(2);
    expect(registry.getAll().length).toBe(2);

    const lookupProviders = registry.getByCapability(ProviderCapability.Lookup);
    expect(lookupProviders.length).toBe(1);
    expect(lookupProviders[0].adapterInstance.identity.id).toBe('musicbrainz');

    const artworkProviders = registry.getByCapability(ProviderCapability.Artwork);
    expect(artworkProviders.length).toBe(1);
    expect(artworkProviders[0].adapterInstance.identity.id).toBe('discogs');
  });
});
