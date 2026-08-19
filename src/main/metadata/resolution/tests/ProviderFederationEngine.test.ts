import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../ProviderRegistry';
import { MetadataMergeEngine, type FieldContribution } from '../MetadataMergeEngine';
import { MetadataResolutionManager } from '../MetadataResolutionManager';
import { DefaultMetadataLookupGateway, type MetadataLookupGateway } from '../MetadataLookupGateway';
import type { ProviderCandidate } from '../../domain/MetadataResolution';
import type { MetadataContext } from '../../domain/MetadataContext';
import { MetadataDiffBuilder } from '../../diff/MetadataDiffBuilder';
import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';

describe('Provider Federation & Merge Engine Test Suite', () => {
  it('resolves provider descriptors and display names via ProviderRegistry', () => {
    const registry = new ProviderRegistry();
    expect(registry.getDisplayName('musicbrainz')).toBe('MusicBrainz');
    expect(registry.getDisplayName('discogs')).toBe('Discogs');
    expect(registry.getDisplayName('coverartarchive')).toBe('Cover Art Archive');
    expect(registry.listDescriptors().length).toBeGreaterThanOrEqual(5);
  });

  it('merges multi-provider candidate fields according to MergePolicy priorities via MetadataMergeEngine', () => {
    const registry = new ProviderRegistry();
    const mergeEngine = new MetadataMergeEngine(registry);

    const candidates: ProviderCandidate[] = [
      {
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        externalId: 'mb-1',
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        score: 0.95,
        matchedAttributes: { album: 'SOUR' }
      },
      {
        providerId: 'discogs',
        providerName: 'Discogs',
        externalId: 'dis-1',
        title: 'brutal (Discogs Edit)',
        artist: 'Olivia Rodrigo',
        score: 0.9,
        matchedAttributes: { genre: 'Pop Rock' }
      },
      {
        providerId: 'coverartarchive',
        providerName: 'Cover Art Archive',
        externalId: 'caa-1',
        title: 'brutal',
        artist: 'Olivia Rodrigo',
        score: 0.99,
        matchedAttributes: { artworkUrl: 'https://coverartarchive.org/front.jpg' }
      }
    ];

    const merged = mergeEngine.mergeCandidates(candidates);

    expect(merged.title).toBe('brutal');
    expect(merged.genre).toBe('Pop Rock');
    expect(merged.artworkUrl).toBe('https://coverartarchive.org/front.jpg');

    // Verify field attributions
    expect(merged.fieldAttributions.title.providerName).toBe('MusicBrainz');
    expect(merged.fieldAttributions.genre.providerName).toBe('Discogs');
    expect(merged.fieldAttributions.artworkUrl.providerName).toBe('Cover Art Archive');
  });

  it('merges independent field contributions across standalone providers directly', () => {
    const registry = new ProviderRegistry();
    const mergeEngine = new MetadataMergeEngine(registry);

    const rawContributions: FieldContribution[] = [
      { fieldId: 'title', providerId: 'musicbrainz', value: 'drivers license', confidenceScore: 0.98 },
      { fieldId: 'artist', providerId: 'musicbrainz', value: 'Olivia Rodrigo', confidenceScore: 0.98 },
      { fieldId: 'genre', providerId: 'discogs', value: 'Bedroom Pop', confidenceScore: 0.92 },
      { fieldId: 'artworkUrl', providerId: 'coverartarchive', value: 'https://coverartarchive.org/dl.jpg', confidenceScore: 0.99 }
    ];

    const merged = mergeEngine.mergeFieldContributions(rawContributions);

    expect(merged.title).toBe('drivers license');
    expect(merged.artist).toBe('Olivia Rodrigo');
    expect(merged.genre).toBe('Bedroom Pop');
    expect(merged.artworkUrl).toBe('https://coverartarchive.org/dl.jpg');

    expect(merged.fieldAttributions.genre.providerName).toBe('Discogs');
    expect(merged.fieldAttributions.artworkUrl.providerName).toBe('Cover Art Archive');
  });

  it('executes end-to-end multi-provider resolution via MetadataResolutionManager and builds diffs via MetadataDiffBuilder', async () => {
    const mockGateway: MetadataLookupGateway = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz',
          externalId: 'mb-101',
          title: 'deja vu',
          artist: 'Olivia Rodrigo',
          score: 0.98,
          matchedAttributes: { album: 'SOUR' }
        },
        {
          providerId: 'discogs',
          providerName: 'Discogs',
          externalId: 'dis-101',
          title: 'deja vu',
          artist: 'Olivia Rodrigo',
          score: 0.92,
          matchedAttributes: { genre: 'Indie Pop' }
        }
      ])
    };

    const manager = new MetadataResolutionManager({ lookupGateway: mockGateway });

    const context: MetadataContext = {
      resources: { primaryType: 'track', targetResources: [{ id: 42, type: 'track', attributes: {} }] },
      execution: { mode: 'Interactive' }
    };

    const resolution = await manager.resolve('op-dejavu', context);

    expect(resolution.candidates).toHaveLength(2);
    expect(resolution.mergedResult).toBeDefined();
    expect(resolution.mergedResult?.title).toBe('deja vu');
    expect(resolution.mergedResult?.genre).toBe('Indie Pop');
    expect(resolution.mergedResult?.fieldAttributions.title.providerName).toBe('MusicBrainz');
    expect(resolution.mergedResult?.fieldAttributions.genre.providerName).toBe('Discogs');

    // Build presentation diffs consuming MergedCandidateResult directly
    const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(
      { songId: 42, path: 'dejavu.mp3', title: 'deja vu (old)', artist: 'Olivia Rodrigo' },
      resolution.mergedResult!
    );

    expect(preview.fieldDiffs.find((f) => f.fieldId === 'title')?.providerName).toBe('MusicBrainz');
    expect(preview.fieldDiffs.find((f) => f.fieldId === 'genre')?.providerName).toBe('Discogs');
  });

  it('recomputes merged candidate result instantly when user selects alternate field provider', () => {
    const registry = new ProviderRegistry();
    const mergeEngine = new MetadataMergeEngine(registry);

    const rawContributions: FieldContribution[] = [
      { fieldId: 'genre', providerId: 'discogs', value: 'Pop Rock', confidenceScore: 0.95 },
      { fieldId: 'genre', providerId: 'spotify', value: 'Synth-Pop', confidenceScore: 0.88 },
      { fieldId: 'genre', providerId: 'musicbrainz', value: 'Pop', confidenceScore: 0.85 }
    ];

    const initialMerged = mergeEngine.mergeFieldContributions(rawContributions);
    expect(initialMerged.genre).toBe('Pop');
    expect(initialMerged.fieldAttributions.genre.providerName).toBe('MusicBrainz');
    expect(initialMerged.fieldAlternatives.genre).toHaveLength(3);

    // User selects Spotify as genre provider
    const updated = mergeEngine.selectFieldProvider(initialMerged, 'genre', 'spotify');
    expect(updated.genre).toBe('Synth-Pop');
    expect(updated.fieldAttributions.genre.providerName).toBe('Spotify');
  });

  it('executes single-pass resolution calling fetchContribution exactly once per provider', async () => {
    const registry = new ProviderRegistry();

    const mbAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98,
        contributions: [
          { fieldId: 'title', providerId: 'musicbrainz', value: 'good 4 u', confidenceScore: 0.98 },
          { fieldId: 'artist', providerId: 'musicbrainz', value: 'Olivia Rodrigo', confidenceScore: 0.98 }
        ]
      })
    };

    const discogsAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'discogs',
        providerName: 'Discogs',
        confidenceScore: 0.92,
        contributions: [
          { fieldId: 'genre', providerId: 'discogs', value: 'Pop Punk', confidenceScore: 0.92 }
        ]
      })
    };

    const caaAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'coverartarchive',
        providerName: 'Cover Art Archive',
        confidenceScore: 0.99,
        contributions: [
          { fieldId: 'artworkUrl', providerId: 'coverartarchive', value: 'https://coverartarchive.org/sour.jpg', confidenceScore: 0.99 }
        ]
      })
    };

    registry.registerInstance('musicbrainz', mbAdapter as any);
    registry.registerInstance('discogs', discogsAdapter as any);
    registry.registerInstance('coverartarchive', caaAdapter as any);

    const gateway = new DefaultMetadataLookupGateway(undefined, registry);
    const manager = new MetadataResolutionManager({ lookupGateway: gateway, providerRegistry: registry });

    const resolution = await manager.resolve({
      operationId: 'op-single-pass',
      targetResourceIds: ['alb-1'],
      albumTitle: 'SOUR',
      artistName: 'Olivia Rodrigo',
      mbid: 'mb-sour'
    });

    // Call count assertion: EXACTLY ONCE per provider (No duplicate searchCandidates pass)
    expect(mbAdapter.fetchContribution).toHaveBeenCalledTimes(1);
    expect(discogsAdapter.fetchContribution).toHaveBeenCalledTimes(1);
    expect(caaAdapter.fetchContribution).toHaveBeenCalledTimes(1);

    // Verify unified result
    expect(resolution.candidates).toHaveLength(3);
    expect(resolution.mergedResult?.title).toBe('good 4 u');
    expect(resolution.mergedResult?.genre).toBe('Pop Punk');
    expect(resolution.mergedResult?.artworkUrl).toBe('https://coverartarchive.org/sour.jpg');
  });

  it('runs providers concurrently and isolates individual provider failures via Promise.allSettled', async () => {
    const registry = new ProviderRegistry();
    let mbRunning = false;
    let discogsRunning = false;
    let maxConcurrent = 0;

    const mbAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockImplementation(async () => {
        mbRunning = true;
        maxConcurrent = Math.max(maxConcurrent, (mbRunning ? 1 : 0) + (discogsRunning ? 1 : 0));
        await new Promise((r) => setTimeout(r, 20));
        mbRunning = false;
        return {
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz',
          confidenceScore: 0.95,
          contributions: [{ fieldId: 'title', providerId: 'musicbrainz', value: 'traitor', confidenceScore: 0.95 }]
        };
      })
    };

    const discogsAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockImplementation(async () => {
        discogsRunning = true;
        maxConcurrent = Math.max(maxConcurrent, (mbRunning ? 1 : 0) + (discogsRunning ? 1 : 0));
        await new Promise((r) => setTimeout(r, 20));
        discogsRunning = false;
        // Provider failure: discogs throws or times out
        throw new Error('Discogs API rate-limited');
      })
    };

    registry.registerInstance('musicbrainz', mbAdapter as any);
    registry.registerInstance('discogs', discogsAdapter as any);

    const gateway = new DefaultMetadataLookupGateway(undefined, registry);
    const result = await gateway.resolveFederated({
      request: {
        operationId: 'op-concurrency',
        resourceId: 1,
        query: { albumTitle: 'SOUR', artistName: 'Olivia Rodrigo' }
      }
    });

    // Concurrency verification: both were in-flight at the same time
    expect(maxConcurrent).toBe(2);

    // Failure isolation: MusicBrainz succeeded even though Discogs threw
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0].fieldId).toBe('title');
    expect(result.contributions[0].value).toBe('traitor');
    expect(result.providerMetrics?.discogs.success).toBe(false);
    expect(result.providerMetrics?.musicbrainz.success).toBe(true);
  });

  it('guarantees sequential legacy calls to searchContributions and searchCandidates share single in-flight resolution without duplicate fetches', async () => {
    const registry = new ProviderRegistry();

    const mbAdapter: Partial<IMetadataProviderAdapter> = {
      fetchContribution: vi.fn().mockResolvedValue({
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98,
        contributions: [{ fieldId: 'title', providerId: 'musicbrainz', value: '1 step forward, 3 steps back', confidenceScore: 0.98 }]
      })
    };

    registry.registerInstance('musicbrainz', mbAdapter as any);
    const gateway = new DefaultMetadataLookupGateway(undefined, registry);

    const context: MetadataContext = {
      request: {
        operationId: 'op-legacy-dup-test',
        resourceId: 1,
        query: { albumTitle: 'SOUR', artistName: 'Olivia Rodrigo' }
      }
    };

    // Invoking both legacy methods concurrently in-flight
    const [contributions, candidates] = await Promise.all([
      gateway.searchContributions(context),
      gateway.searchCandidates(context)
    ]);

    // Call count assertion: Still EXACTLY 1 because of in-flight deduplication
    expect(mbAdapter.fetchContribution).toHaveBeenCalledTimes(1);
    expect(contributions).toHaveLength(1);
    expect(candidates).toHaveLength(1);
  });
});
