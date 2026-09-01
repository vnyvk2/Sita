import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { WikipediaApiClient } from '@main/platform/networking/WikipediaApiClient';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@main/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('WikipediaApiClient', () => {
  let mockPipeline: Partial<RequestPipeline>;
  let client: WikipediaApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches biography from direct REST summary when music keywords match', async () => {
    mockPipeline = {
      execute: vi.fn().mockImplementation(async (options: any) => {
        if (options.url.includes('/page/summary/Gracie_Abrams')) {
          return {
            data: {
              type: 'standard',
              title: 'Gracie Abrams',
              description: 'American singer-songwriter',
              extract: 'Gracie Madigan Abrams is an American singer-songwriter.',
              originalimage: { source: 'https://wikimedia.org/gracie.jpg' },
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Gracie_Abrams' } }
            }
          };
        }
        if (options.params?.action === 'query' && options.params?.prop?.includes('extracts')) {
          return {
            data: {
              query: {
                pages: {
                  '12345': {
                    title: 'Gracie Abrams',
                    extract:
                      'Gracie Madigan Abrams (born September 7, 1999) is an American singer-songwriter.\n\nShe released her debut album in 2023.'
                  }
                }
              }
            }
          };
        }
        return { data: null };
      })
    };

    client = new WikipediaApiClient(mockPipeline as RequestPipeline);
    const result = await client.getArtistBiography('Gracie Abrams');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Gracie Abrams');
    expect(result?.summary).toBe('Gracie Madigan Abrams is an American singer-songwriter.');
    expect(result?.fullExtract).toContain('She released her debut album in 2023.');
    expect(result?.originalImage).toBe('https://wikimedia.org/gracie.jpg');
  });

  it('handles disambiguation by resolving qualified REST candidates (e.g. band/musician)', async () => {
    mockPipeline = {
      execute: vi.fn().mockImplementation(async (options: any) => {
        // Direct lookup returns disambiguation (e.g. Bush)
        if (options.url.endsWith('/page/summary/Bush')) {
          return {
            data: {
              type: 'disambiguation',
              title: 'Bush',
              description: 'Disambiguation page',
              extract: 'Bush may refer to...'
            }
          };
        }
        // Qualified candidate (Bush (band)) matches via direct REST summary
        if (options.url.includes('/page/summary/Bush_(band)')) {
          return {
            data: {
              type: 'standard',
              title: 'Bush (band)',
              description: 'English rock band',
              extract: 'Bush are an English rock band formed in London in 1992.',
              content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Bush_(band)' } }
            }
          };
        }
        // Extract lookup for Bush (band)
        if (options.params?.action === 'query' && options.params?.titles === 'Bush (band)') {
          return {
            data: {
              query: {
                pages: {
                  '67890': {
                    title: 'Bush (band)',
                    description: 'English rock band',
                    extract:
                      'Bush are an English rock band formed in London in 1992.\n\nThe band consists of lead vocalist Gavin Rossdale.'
                  }
                }
              }
            }
          };
        }
        return { data: null };
      })
    };

    client = new WikipediaApiClient(mockPipeline as RequestPipeline);
    const result = await client.getArtistBiography('Bush');

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Bush (band)');
    expect(result?.fullExtract).toContain('English rock band');
  });

  it('safely rejects non-music collision entities and returns null', async () => {
    mockPipeline = {
      execute: vi.fn().mockImplementation(async (options: any) => {
        // Direct lookup returns country / geography
        if (options.url.endsWith('/page/summary/America')) {
          return {
            data: {
              type: 'standard',
              title: 'Americas',
              description: 'Landmass in the Western Hemisphere',
              extract:
                'The Americas comprise the totality of the continents of North and South America.'
            }
          };
        }
        // No qualified candidate found
        return { data: null };
      })
    };

    client = new WikipediaApiClient(mockPipeline as RequestPipeline);
    const result = await client.getArtistBiography('America');

    // Must be null rather than returning geography/country article
    expect(result).toBeNull();
  });
});
