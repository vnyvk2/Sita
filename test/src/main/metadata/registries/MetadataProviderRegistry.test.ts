import { describe, expect, it } from 'vitest';

import { MetadataCapabilities } from '@main/metadata/common/types';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';

describe('MetadataProviderRegistry', () => {
  it('should register and query providers by capability', () => {
    const registry = new MetadataProviderRegistry();

    const mockProviderInfo = new MetadataProviderInfo({
      id: 'musicbrainz',
      name: 'MusicBrainz',
      version: '1.0.0',
      priority: 80,
      capabilities: new Set([MetadataCapabilities.Genre, MetadataCapabilities.BPM])
    });

    const mockProvider: IMetadataProvider = {
      info: mockProviderInfo,
      initialize: async () => {},
      supports: (cap) => mockProviderInfo.supports(cap),
      fetch: async () => null,
      refresh: async () => null,
      shutdown: async () => {},
      getCapabilities: () => mockProviderInfo.capabilities
    };

    registry.register(mockProvider);
    expect(registry.get('musicbrainz')).toBe(mockProvider);

    const genreProviders = registry.getProvidersForCapability(MetadataCapabilities.Genre);
    expect(genreProviders.length).toBe(1);
    expect(genreProviders[0].info.name).toBe('MusicBrainz');

    const lyricProviders = registry.getProvidersForCapability(MetadataCapabilities.Lyrics);
    expect(lyricProviders.length).toBe(0);
  });
});
