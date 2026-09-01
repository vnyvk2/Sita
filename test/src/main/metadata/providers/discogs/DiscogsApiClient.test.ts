import { DiscogsApiClient } from '@main/metadata/providers/discogs/DiscogsApiClient';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { describe, expect, it, vi } from 'vitest';

describe('DiscogsApiClient (Phase 1 Canonical Matching)', () => {
  const mockPipeline = {
    execute: vi.fn()
  } as unknown as RequestPipeline;

  it('matches Discogs candidate release titles containing Artist - Title format', async () => {
    const client = new DiscogsApiClient(mockPipeline);

    vi.spyOn(mockPipeline, 'execute').mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/database/search')) {
        return {
          status: 200,
          data: {
            results: [
              {
                id: 12345,
                title: 'Radiohead - OK Computer',
                year: '1997',
                genre: ['Rock'],
                style: ['Alternative Rock']
              }
            ]
          }
        };
      }
      if (urlStr.includes('/releases/12345')) {
        return {
          status: 200,
          data: {
            id: 12345,
            title: 'OK Computer',
            genres: ['Rock'],
            styles: ['Alternative Rock', 'Art Rock'],
            master_id: 9999
          }
        };
      }
      return { status: 404, data: null };
    });

    const contribution = await client.fetchContributionData({
      title: 'OK Computer',
      artist: 'Radiohead'
    });

    expect(contribution).not.toBeNull();
    expect(contribution?.genre).toBe('Rock');
    expect(contribution?.style).toBe('Alternative Rock, Art Rock');
    expect(contribution?.masterRelease).toBe('discogs:master:9999');
  });

  it('correctly matches international artists and titles using normalizeForMatching', async () => {
    const client = new DiscogsApiClient(mockPipeline);

    vi.spyOn(mockPipeline, 'execute').mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/database/search')) {
        return {
          status: 200,
          data: {
            results: [
              {
                id: 54321,
                title: 'YOASOBI - THE BOOK (EP)',
                year: '2021',
                genre: ['Pop'],
                style: ['J-Pop']
              }
            ]
          }
        };
      }
      if (urlStr.includes('/releases/54321')) {
        return {
          status: 200,
          data: {
            id: 54321,
            title: 'THE BOOK',
            genres: ['Pop'],
            styles: ['J-Pop']
          }
        };
      }
      return { status: 404, data: null };
    });

    const contribution = await client.fetchContributionData({
      title: 'The Book',
      artist: 'YOASOBI'
    });

    expect(contribution).not.toBeNull();
    expect(contribution?.style).toBe('J-Pop');
  });

  it('rejects candidate when title or artist similarity does not match query', async () => {
    const client = new DiscogsApiClient(mockPipeline);

    vi.spyOn(mockPipeline, 'execute').mockImplementation(async (url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/database/search')) {
        return {
          status: 200,
          data: {
            results: [
              {
                id: 88888,
                title: 'Completely Different Artist - Unrelated Album',
                genre: ['Pop']
              }
            ]
          }
        };
      }
      return { status: 404, data: null };
    });

    const contribution = await client.fetchContributionData({
      title: 'OK Computer',
      artist: 'Radiohead'
    });

    expect(contribution).toBeNull();
  });
});
