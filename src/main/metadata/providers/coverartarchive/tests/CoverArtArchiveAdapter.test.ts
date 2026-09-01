import { describe, expect, it, vi } from 'vitest';

import { RequestPipeline } from '../../../../platform/networking/RequestPipeline';
import { IdentityResolutionCache } from '../../../cache/IdentityResolutionCache';
import { ProviderRegistry } from '../../../resolution/ProviderRegistry';
import { CaaApiClient } from '../CaaApiClient';
import { CoverArtArchiveAdapter } from '../CoverArtArchiveAdapter';

describe('Phase 14G — Cover Art Archive Contribution Adapter Suite', () => {
  it('fetchContribution() returns specialized CAA contributions (artworkUrl, front, back, thumbnail)', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new CaaApiClient(pipeline);
    const registry = new ProviderRegistry();
    const cache = new IdentityResolutionCache();
    const adapter = new CoverArtArchiveAdapter(apiClient, { registry, cache });

    const mbid = '76df3287-6cda-33eb-8e9a-044b5e15ffdd';

    vi.spyOn(apiClient, 'getReleaseCoverArt').mockResolvedValueOnce({
      data: {
        release: `https://musicbrainz.org/release/${mbid}`,
        images: [
          {
            id: '123',
            image:
              'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123.jpg',
            front: true,
            back: false,
            thumbnails: {
              500: 'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123-500.jpg'
            }
          },
          {
            id: '456',
            image:
              'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/456.jpg',
            front: false,
            back: true
          }
        ]
      },
      isNotFound: false
    });

    const contribution = await adapter.fetchContribution({ mbid });

    expect(contribution).not.toBeNull();
    expect(contribution?.providerId).toBe('coverartarchive');
    expect(contribution?.contributions).toHaveLength(4);

    const fieldMap = new Map(contribution?.contributions.map((c) => [c.fieldId, c.value]));
    expect(fieldMap.get('artworkUrl')).toBe(
      'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123.jpg'
    );
    expect(fieldMap.get('front')).toBe(
      'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123.jpg'
    );
    expect(fieldMap.get('back')).toBe(
      'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/456.jpg'
    );
    expect(fieldMap.get('thumbnail')).toBe(
      'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123-500.jpg'
    );
  });

  it('fetchContribution() returns null for empty or invalid MBIDs', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new CaaApiClient(pipeline);
    const adapter = new CoverArtArchiveAdapter(apiClient);

    const contribution = await adapter.fetchContribution({});
    expect(contribution).toBeNull();
  });

  it('lookup() resolves cover art URLs for valid MBID', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new CaaApiClient(pipeline);
    const adapter = new CoverArtArchiveAdapter(apiClient);

    const mbid = '76df3287-6cda-33eb-8e9a-044b5e15ffdd';

    vi.spyOn(apiClient, 'getReleaseCoverArt').mockResolvedValueOnce({
      data: {
        images: [
          {
            id: '123',
            image:
              'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123.jpg',
            front: true,
            back: false
          }
        ]
      },
      isNotFound: false
    });

    const result = await adapter.lookup({ entityId: mbid } as any);
    expect(result.confidence.score).toBe(0.95);
    expect((result.payload as any).coverArtUrl).toBe(
      'https://coverartarchive.org/release/76df3287-6cda-33eb-8e9a-044b5e15ffdd/123.jpg'
    );
  });
});
