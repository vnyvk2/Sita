import { describe, expect, it } from 'vitest';

import { MetadataCapabilities } from '@main/metadata/common/types';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';

describe('MetadataProviderRegistry', () => {
  it('should register and query providers by capability', () => {
    const registry = new MetadataProviderRegistry();

    const mockProviderInfo = new MetadataProviderInfo({
      id: 'musicbrainz',
      displayName: 'MusicBrainz',
      version: '1.0.0',
      priority: 80,
      capabilities: [MetadataCapabilities.Genre, MetadataCapabilities.BPM]
    });

    const mockProvider: IMetadataProvider = {
      info: mockProviderInfo,
      initialize: async () => {},
      supports: (cap) => mockProviderInfo.supports(cap),
      fetch: async () =>
        new ProviderResult({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: mockProviderInfo
        }),
      refresh: async () =>
        new ProviderResult({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: mockProviderInfo
        }),
      shutdown: async () => {},
      getCapabilities: () => mockProviderInfo.capabilities
    };

    registry.register(mockProvider);
    expect(registry.get('musicbrainz')).toBe(mockProvider);

    const genreProviders = registry.getProvidersForCapability(MetadataCapabilities.Genre);
    expect(genreProviders.length).toBe(1);
    expect(genreProviders[0].info.displayName).toBe('MusicBrainz');

    const lyricProviders = registry.getProvidersForCapability(MetadataCapabilities.Lyrics);
    expect(lyricProviders.length).toBe(0);
  });
});
