import { describe, expect, it } from 'vitest';

import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { DefaultProviderMergePolicy } from '@main/metadata/providers/policies/DefaultProviderMergePolicy';

describe('DefaultProviderMergePolicy', () => {
  it('should merge provider payload fields based on confidence and provider priority', () => {
    const policy = new DefaultProviderMergePolicy();
    const localInfo = new MetadataProviderInfo({ id: 'local', displayName: 'Local', version: '1.0', priority: 80 });
    const musicBrainzInfo = new MetadataProviderInfo({ id: 'musicbrainz', displayName: 'MusicBrainz', version: '1.0', priority: 90 });

    const localResult = new ProviderResult({
      payload: { title: 'Local Title', year: 2020 },
      confidence: new MetadataConfidence(0.8),
      providerInfo: localInfo,
      status: 'success'
    });

    const musicBrainzResult = new ProviderResult({
      payload: { title: 'MB Title', genre: 'Rock' },
      confidence: new MetadataConfidence(0.95),
      providerInfo: musicBrainzInfo,
      status: 'success'
    });

    const merged = policy.merge([localResult, musicBrainzResult]) as any;

    expect(merged).not.toBeNull();
    expect(merged.title).toBe('MB Title'); // Higher confidence MB Title wins
    expect(merged.year).toBe(2020); // Local year preserved
    expect(merged.genre).toBe('Rock'); // MB genre merged
  });
});
