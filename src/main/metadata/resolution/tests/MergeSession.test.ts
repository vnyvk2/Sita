import { describe, expect, it } from 'vitest';

import { MergeSession } from '../MergeSession';
import { MetadataMergeEngine, type FieldContribution } from '../MetadataMergeEngine';
import { ProviderRegistry } from '../ProviderRegistry';

describe('Interactive MergeSession Test Suite', () => {
  it('initializes MergeSession and recomputes preview via policy updating when selecting alternate provider', () => {
    const registry = new ProviderRegistry();
    const mergeEngine = new MetadataMergeEngine(registry);

    const rawContributions: FieldContribution[] = [
      { fieldId: 'genre', providerId: 'discogs', value: 'Pop Rock', confidenceScore: 0.95 },
      { fieldId: 'genre', providerId: 'spotify', value: 'Synth-Pop', confidenceScore: 0.88 },
      { fieldId: 'genre', providerId: 'musicbrainz', value: 'Pop', confidenceScore: 0.85 }
    ];

    const session1 = new MergeSession(mergeEngine, rawContributions);
    expect(session1.result.genre).toBe('Pop');
    expect(session1.getAttribution('genre')?.providerName).toBe('MusicBrainz');
    expect(session1.getAlternatives('genre')).toHaveLength(3);

    // User switches genre provider to Spotify
    const session2 = session1.selectProvider('genre', 'spotify');
    expect(session2.result.genre).toBe('Synth-Pop');
    expect(session2.getAttribution('genre')?.providerName).toBe('Spotify');
    expect(session2.policy.merge?.fieldPolicies?.genre.preferredProviderId).toBe('spotify');

    // Original session remains immutable
    expect(session1.result.genre).toBe('Pop');
  });
});
