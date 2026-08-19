import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProviderAdapter, IProviderLifecycle } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import { ProviderState } from '../../contracts/ProviderStatus';
import { MetadataProviderRuntime } from '../MetadataProviderRuntime';

const initSpy = vi.fn().mockResolvedValue(undefined);
const shutdownSpy = vi.fn().mockResolvedValue(undefined);

const mockAdapter: IMetadataProviderAdapter & IProviderLifecycle = {
  identity: {
    id: 'mock-provider',
    name: 'Mock Provider',
    version: '1.0.0',
    providerType: 'online'
  },
  capabilities: new ProviderCapabilities([ProviderCapability.Lookup, ProviderCapability.Artwork]),
  initialize: initSpy,
  shutdown: shutdownSpy,
  supports: (cap) => cap === ProviderCapability.Lookup || cap === ProviderCapability.Artwork,
  lookup: vi.fn().mockResolvedValue({ providerId: 'mock-provider', success: true }),
  search: vi.fn().mockResolvedValue([])
};

describe('Metadata Runtime — MetadataProviderRuntime & Health State', () => {
  it('initializes provider adapter and transitions state to Healthy', async () => {
    const runtime = new MetadataProviderRuntime(mockAdapter);
    expect(runtime.status.state).toBe(ProviderState.Uninitialized);

    await runtime.initialize();
    expect(initSpy).toHaveBeenCalled();
    expect(runtime.status.state).toBe(ProviderState.Healthy);
    expect(runtime.isAvailable()).toBe(true);
  });

  it('records consecutive failures and transitions from Healthy to Degraded to Offline', async () => {
    const runtime = new MetadataProviderRuntime(mockAdapter, undefined, {
      failureThresholdBeforeDegraded: 2,
      failureThresholdBeforeOffline: 4
    });
    await runtime.initialize();

    runtime.recordFailure('Timeout 1');
    expect(runtime.status.state).toBe(ProviderState.Healthy);

    runtime.recordFailure('Timeout 2');
    expect(runtime.status.state).toBe(ProviderState.Degraded);
    expect(runtime.isAvailable()).toBe(true);

    runtime.recordFailure('Timeout 3');
    runtime.recordFailure('Timeout 4');
    expect(runtime.status.state).toBe(ProviderState.Offline);
    expect(runtime.isAvailable()).toBe(false);

    runtime.recordSuccess(120);
    expect(runtime.status.state).toBe(ProviderState.Healthy);
    expect(runtime.status.consecutiveFailures).toBe(0);
  });

  describe('Multi-Source Discovery Engine & Zero-Regression Verification', () => {
    const mbSearchSpy = vi.fn().mockResolvedValue([
      { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021, releaseId: 'mb-1', provider: 'musicbrainz', rankingScore: 195 }
    ]);
    const discogsSearchSpy = vi.fn().mockResolvedValue([
      { title: 'SOUR (Deluxe)', artist: 'Olivia Rodrigo', year: 2022, releaseId: 'dg-1', provider: 'discogs', rankingScore: 185 }
    ]);

    const musicBrainzMock: IMetadataProviderAdapter = {
      identity: { id: 'musicbrainz', name: 'MusicBrainz', version: '1.0.0', providerType: 'online' },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn(),
      searchAlbums: mbSearchSpy
    };

    const discogsMock: IMetadataProviderAdapter = {
      identity: { id: 'discogs', name: 'Discogs', version: '1.0.0', providerType: 'online' },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn(),
      searchAlbums: discogsSearchSpy
    };

    it('Zero-Regression Invariant: under default preferences, queries ONLY MusicBrainz', async () => {
      mbSearchSpy.mockClear();
      discogsSearchSpy.mockClear();

      const mockPreferencesService = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz'],
          searchProviderPriority: ['musicbrainz']
        })
      };

      const runtime = new MetadataProviderRuntime(
        [musicBrainzMock, discogsMock],
        undefined,
        undefined,
        mockPreferencesService as any
      );
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', { limit: 10, targetTrackCount: 11 });

      expect(mbSearchSpy).toHaveBeenCalledTimes(1);
      expect(discogsSearchSpy).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('musicbrainz');
    });

    it('Multi-Source Fan-Out: when Discogs is enabled, queries both MB and Discogs in parallel', async () => {
      mbSearchSpy.mockClear();
      discogsSearchSpy.mockClear();

      const mockPreferencesService = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz', 'discogs'],
          searchProviderPriority: ['musicbrainz', 'discogs']
        })
      };

      const runtime = new MetadataProviderRuntime(
        [musicBrainzMock, discogsMock],
        undefined,
        undefined,
        mockPreferencesService as any
      );
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', { limit: 10, targetTrackCount: 11 });

      expect(mbSearchSpy).toHaveBeenCalledTimes(1);
      expect(discogsSearchSpy).toHaveBeenCalledTimes(1);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('Source Override Invariant: explicit source: "discogs" queries ONLY Discogs', async () => {
      mbSearchSpy.mockClear();
      discogsSearchSpy.mockClear();

      const mockPreferencesService = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz'],
          searchProviderPriority: ['musicbrainz']
        })
      };

      const runtime = new MetadataProviderRuntime(
        [musicBrainzMock, discogsMock],
        undefined,
        undefined,
        mockPreferencesService as any
      );
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        source: 'discogs'
      });

      expect(mbSearchSpy).not.toHaveBeenCalled();
      expect(discogsSearchSpy).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('discogs');
    });

    it('Failure & Timeout Isolation: failure of one provider does not break overall search', async () => {
      const failingDiscogsMock: IMetadataProviderAdapter = {
        identity: { id: 'discogs', name: 'Discogs', version: '1.0.0', providerType: 'online' },
        capabilities: new ProviderCapabilities([ProviderCapability.Search]),
        supports: () => true,
        lookup: vi.fn(),
        search: vi.fn(),
        searchAlbums: vi.fn().mockRejectedValue(new Error('Discogs HTTP 504 Gateway Timeout'))
      };

      mbSearchSpy.mockClear();

      const mockPreferencesService = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz', 'discogs'],
          searchProviderPriority: ['musicbrainz', 'discogs']
        })
      };

      const runtime = new MetadataProviderRuntime(
        [musicBrainzMock, failingDiscogsMock],
        undefined,
        undefined,
        mockPreferencesService as any
      );
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', { limit: 10 });

      // MusicBrainz succeeds while Discogs fails silently/isolated
      expect(mbSearchSpy).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('musicbrainz');
    });
  });
});
