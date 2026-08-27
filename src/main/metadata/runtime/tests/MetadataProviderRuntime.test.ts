import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_SEARCH_RANKING_WEIGHTS } from '../../../../common/metadata/preferences';
import type {
  IMetadataProviderAdapter,
  IProviderLifecycle
} from '../../contracts/IMetadataProviderAdapter';
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
      {
        title: 'SOUR',
        artist: 'Olivia Rodrigo',
        year: 2021,
        releaseId: 'mb-1',
        provider: 'musicbrainz',
        rankingScore: 195
      }
    ]);
    const discogsSearchSpy = vi.fn().mockResolvedValue([
      {
        title: 'SOUR (Deluxe)',
        artist: 'Olivia Rodrigo',
        year: 2022,
        releaseId: 'dg-1',
        provider: 'discogs',
        rankingScore: 185
      }
    ]);

    const musicBrainzMock: IMetadataProviderAdapter = {
      identity: {
        id: 'musicbrainz',
        name: 'MusicBrainz',
        version: '1.0.0',
        providerType: 'online'
      },
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

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        targetTrackCount: 11
      });

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

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        targetTrackCount: 11
      });

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

    it('Cross-Source Resolution: higher quality candidate wins deduplication cluster regardless of provider order', async () => {
      // MB returns a candidate with lower base score / track mismatch (Probable/Weak)
      const mbWeakSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'mb-1',
          provider: 'musicbrainz',
          rankingScore: 50,
          trackCount: 5
        }
      ]);
      // Discogs returns identical album edition with higher base score and matching track count (Definitive)
      const discogsStrongSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'dg-1',
          provider: 'discogs',
          rankingScore: 95,
          trackCount: 11
        }
      ]);

      const mbAdapter: IMetadataProviderAdapter = {
        ...musicBrainzMock,
        searchAlbums: mbWeakSpy
      };
      const dgAdapter: IMetadataProviderAdapter = {
        ...discogsMock,
        searchAlbums: discogsStrongSpy
      };

      const mockPreferencesService = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz', 'discogs'],
          // Even when MB is priority #1, Discogs wins because it is in a higher quality band (Definitive vs Probable)
          searchProviderPriority: ['musicbrainz', 'discogs']
        })
      };

      const runtime = new MetadataProviderRuntime(
        [mbAdapter, dgAdapter],
        undefined,
        undefined,
        mockPreferencesService as any
      );
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        targetTrackCount: 11
      });

      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('discogs');
      expect(results[0].releaseId).toBe('dg-1');
    });

    it('Priority Tie-Breaker: when candidates share identical quality band, user source priority decides winner', async () => {
      const mbDefinitiveSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'mb-1',
          provider: 'musicbrainz',
          rankingScore: 180
        }
      ]);
      const dgDefinitiveSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'dg-1',
          provider: 'discogs',
          rankingScore: 180
        }
      ]);

      const mbAdapter: IMetadataProviderAdapter = {
        ...musicBrainzMock,
        searchAlbums: mbDefinitiveSpy
      };
      const dgAdapter: IMetadataProviderAdapter = { ...discogsMock, searchAlbums: dgDefinitiveSpy };

      // Case A: User priority has Discogs first
      const mockPrefsDiscogsFirst = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz', 'discogs'],
          searchProviderPriority: ['discogs', 'musicbrainz']
        })
      };

      const runtimeA = new MetadataProviderRuntime(
        [mbAdapter, dgAdapter],
        undefined,
        undefined,
        mockPrefsDiscogsFirst as any
      );
      await runtimeA.initialize();
      const resultsA = await runtimeA.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        targetTrackCount: 11
      });

      expect(resultsA).toHaveLength(1);
      expect(resultsA[0].provider).toBe('discogs');

      // Case B: User priority has MusicBrainz first
      const mockPrefsMbFirst = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz', 'discogs'],
          searchProviderPriority: ['musicbrainz', 'discogs']
        })
      };

      const runtimeB = new MetadataProviderRuntime(
        [mbAdapter, dgAdapter],
        undefined,
        undefined,
        mockPrefsMbFirst as any
      );
      await runtimeB.initialize();
      const resultsB = await runtimeB.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 10,
        targetTrackCount: 11
      });

      expect(resultsB).toHaveLength(1);
      expect(resultsB[0].provider).toBe('musicbrainz');
    });

    it('Custom Ranking Weights: user-tuned weights change candidate ordering', async () => {
      const dualCandidateSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'a-1',
          provider: 'musicbrainz',
          rankingScore: 100,
          trackCount: 11
        },
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2022,
          releaseId: 'b-1',
          provider: 'musicbrainz',
          rankingScore: 100
        }
      ]);

      const mbAdapter: IMetadataProviderAdapter = {
        ...musicBrainzMock,
        searchAlbums: dualCandidateSpy
      };

      const defaultPrefs = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz'],
          searchProviderPriority: ['musicbrainz']
        })
      };

      const runtimeDefaults = new MetadataProviderRuntime(
        [mbAdapter],
        undefined,
        undefined,
        defaultPrefs as any
      );
      await runtimeDefaults.initialize();
      const defaultResults = await runtimeDefaults.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 5,
        targetTrackCount: 11
      });

      expect(defaultResults).toHaveLength(2);
      expect(defaultResults[0].releaseId).toBe('a-1');

      const tunedPrefs = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz'],
          searchProviderPriority: ['musicbrainz'],
          searchRankingWeights: { ...DEFAULT_SEARCH_RANKING_WEIGHTS, trackCountMatch: -10 }
        })
      };

      const runtimeTuned = new MetadataProviderRuntime(
        [{ ...musicBrainzMock, searchAlbums: dualCandidateSpy }],
        undefined,
        undefined,
        tunedPrefs as any
      );
      await runtimeTuned.initialize();
      const tunedResults = await runtimeTuned.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 5,
        targetTrackCount: 11
      });

      expect(tunedResults).toHaveLength(2);
      expect(tunedResults[0].releaseId).toBe('b-1');
    });

    it('attaches ranking breakdown and quality band to returned candidates', async () => {
      const breakdownSpy = vi.fn().mockResolvedValue([
        {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          releaseId: 'mb-bd',
          provider: 'musicbrainz',
          rankingScore: 170,
          trackCount: 11
        }
      ]);

      const adapter: IMetadataProviderAdapter = { ...musicBrainzMock, searchAlbums: breakdownSpy };
      const prefs = {
        getPreferences: vi.fn().mockResolvedValue({
          enabledSearchProviders: ['musicbrainz'],
          searchProviderPriority: ['musicbrainz']
        })
      };

      const runtime = new MetadataProviderRuntime([adapter], undefined, undefined, prefs as any);
      await runtime.initialize();

      const results = await runtime.searchAlbums('SOUR', 'Olivia Rodrigo', {
        limit: 5,
        targetTrackCount: 11
      });

      expect(results).toHaveLength(1);
      const breakdown = results[0].rankingBreakdown;
      expect(breakdown).toBeDefined();
      expect(typeof breakdown!.baseScore).toBe('number');
      expect(breakdown!.trackCountBonus).toBe(10);
      expect(['Definitive', 'Probable', 'Weak']).toContain(results[0].qualityBand);
    });

    it('Dynamic Provider Capabilities: dynamically discovers all registered search providers', async () => {
      const runtime = new MetadataProviderRuntime([musicBrainzMock, discogsMock]);
      await runtime.initialize();

      const providers = runtime.getAvailableSearchProviders();
      expect(providers).toHaveLength(2);
      expect(providers.map((p) => p.id)).toEqual(['musicbrainz', 'discogs']);
      expect(providers.find((p) => p.id === 'musicbrainz')?.displayName).toBe('MusicBrainz');
      expect(providers.find((p) => p.id === 'discogs')?.displayName).toBe('Discogs');
    });

    it('Network Cancellation: propagates AbortSignal to adapter searchAlbums', async () => {
      let receivedSignal: AbortSignal | undefined;
      const abortableAdapter: IMetadataProviderAdapter = {
        identity: { id: 'discogs', name: 'Discogs', version: '1.0.0', providerType: 'online' },
        capabilities: new ProviderCapabilities([ProviderCapability.Search]),
        supports: () => true,
        lookup: vi.fn(),
        search: vi.fn(),
        searchAlbums: vi.fn().mockImplementation((_alb, _art, _opts, signal) => {
          receivedSignal = signal;
          return Promise.resolve([]);
        })
      };

      const runtime = new MetadataProviderRuntime([abortableAdapter]);
      await runtime.initialize();

      await runtime.searchAlbums('SOUR', 'Olivia Rodrigo');
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
      expect(receivedSignal?.aborted).toBe(false);
    });

    it('Cancellation is not a failure: aborted search does not degrade provider health', async () => {
      const abortableAdapter: IMetadataProviderAdapter = {
        identity: { id: 'discogs', name: 'Discogs', version: '1.0.0', providerType: 'online' },
        capabilities: new ProviderCapabilities([ProviderCapability.Search]),
        supports: () => true,
        lookup: vi.fn(),
        search: vi.fn(),
        searchAlbums: vi.fn().mockImplementation((_alb, _art, _opts, signal) => {
          const abortErr = new Error('Operation aborted');
          abortErr.name = 'AbortError';
          void signal;
          return Promise.reject(abortErr);
        })
      };

      const runtime = new MetadataProviderRuntime([abortableAdapter]);
      await runtime.initialize();

      for (let i = 0; i < 10; i += 1) {
        await expect(runtime.searchAlbums('SOUR', 'Olivia Rodrigo')).resolves.toEqual([]);
      }

      expect(runtime.status.state).toBe(ProviderState.Healthy);
      expect(runtime.isAvailable()).toBe(true);
    });
  });
});
