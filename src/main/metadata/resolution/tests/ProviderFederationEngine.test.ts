import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from '../ProviderRegistry';
import { MetadataMergeEngine, type FieldContribution } from '../MetadataMergeEngine';
import type { ProviderCandidate } from '../../domain/MetadataResolution';

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
});
