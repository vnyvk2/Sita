import { describe, expect, it, vi } from 'vitest';
import { CaaApiClient } from '@main/metadata/providers/coverartarchive/CaaApiClient';
import { CoverArtArchiveAdapter } from '@main/metadata/providers/coverartarchive/CoverArtArchiveAdapter';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';

describe('CoverArtArchiveAdapter (BUG-19 Release Group Fallback)', () => {
  it('falls back to release-group endpoint when release endpoint returns 404/no images', async () => {
    const executedUrls: string[] = [];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockImplementation(async (url: string) => {
        executedUrls.push(url);
        if (url.includes('/release/rel-123')) {
          // Release not found / 404 in CAA
          return { status: 404, data: null, headers: {} };
        }
        if (url.includes('/release-group/rg-456')) {
          // Release group has cover art
          return {
            status: 200,
            data: {
              images: [
                {
                  id: 1,
                  image: 'https://coverartarchive.org/release-group/rg-456/front.jpg',
                  front: true,
                  back: false,
                  thumbnails: { 500: 'https://coverartarchive.org/release-group/rg-456/front-500.jpg' }
                }
              ]
            },
            headers: {}
          };
        }
        return { status: 404, data: null, headers: {} };
      })
    };

    const apiClient = new CaaApiClient(mockPipeline as RequestPipeline);
    const adapter = new CoverArtArchiveAdapter(apiClient);

    const contribution = await adapter.fetchContribution({
      mbid: 'rel-123',
      releaseGroupId: 'rg-456'
    });

    expect(contribution).not.toBeNull();
    const artworkUrlContrib = contribution?.contributions.find((c) => c.fieldId === 'artworkUrl');
    expect(artworkUrlContrib?.value).toBe('https://coverartarchive.org/release-group/rg-456/front.jpg');

    // Invariant: Release MBID queried first, followed by Release Group fallback
    expect(executedUrls).toEqual([
      'https://coverartarchive.org/release/rel-123',
      'https://coverartarchive.org/release-group/rg-456'
    ]);
  });

  it('does NOT query release-group if release endpoint returns valid artwork', async () => {
    const executedUrls: string[] = [];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockImplementation(async (url: string) => {
        executedUrls.push(url);
        return {
          status: 200,
          data: {
            images: [
              {
                id: 99,
                image: 'https://coverartarchive.org/release/rel-direct/front.jpg',
                front: true,
                back: false
              }
            ]
          },
          headers: {}
        };
      })
    };

    const apiClient = new CaaApiClient(mockPipeline as RequestPipeline);
    const adapter = new CoverArtArchiveAdapter(apiClient);

    const contribution = await adapter.fetchContribution({
      mbid: 'rel-direct',
      releaseGroupId: 'rg-unused'
    });

    expect(contribution).not.toBeNull();
    const artworkUrlContrib = contribution?.contributions.find((c) => c.fieldId === 'artworkUrl');
    expect(artworkUrlContrib?.value).toBe('https://coverartarchive.org/release/rel-direct/front.jpg');

    // Invariant: Only release endpoint was called
    expect(executedUrls).toEqual(['https://coverartarchive.org/release/rel-direct']);
  });

  it('does NOT fallback to release-group on 5xx / network error / timeout (preserves error semantics)', async () => {
    const executedUrls: string[] = [];

    const mockPipeline: Partial<RequestPipeline> = {
      execute: vi.fn().mockImplementation(async (url: string) => {
        executedUrls.push(url);
        if (url.includes('/release/rel-500')) {
          // Server error 500
          return { status: 500, data: null, headers: {} };
        }
        return { status: 404, data: null, headers: {} };
      })
    };

    const apiClient = new CaaApiClient(mockPipeline as RequestPipeline);
    const adapter = new CoverArtArchiveAdapter(apiClient);

    const contribution = await adapter.fetchContribution({
      mbid: 'rel-500',
      releaseGroupId: 'rg-should-not-be-called'
    });

    // Invariant: 500 error does NOT silently trigger release group fallback
    expect(contribution).toBeNull();
    expect(executedUrls).toEqual(['https://coverartarchive.org/release/rel-500']);
  });
});
