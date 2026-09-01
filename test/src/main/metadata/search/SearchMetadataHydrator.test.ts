import { describe, expect, it, vi } from 'vitest';

vi.mock('@db/db', () => ({
  db: {
    query: {
      songs: { findFirst: vi.fn(), findMany: vi.fn() },
      artists: { findFirst: vi.fn(), findMany: vi.fn() },
      albums: { findFirst: vi.fn(), findMany: vi.fn() },
      genres: { findFirst: vi.fn(), findMany: vi.fn() },
      playlists: { findFirst: vi.fn(), findMany: vi.fn() }
    }
  }
}));

import type { IMetadataGateway } from '@main/metadata/interfaces/IMetadataGateway';
import { SearchMetadataHydrator } from '@main/metadata/search/SearchMetadataHydrator';

describe('SearchMetadataHydrator', () => {
  it('should delegate loading to IMetadataGateway and trigger preloading when over 50 matches', async () => {
    let preloadCalled = false;
    const mockGateway: IMetadataGateway = {
      load: vi.fn(),
      loadMany: vi.fn().mockResolvedValue([]),
      refresh: vi.fn(),
      refreshMany: vi.fn(),
      preload: vi.fn(() => {
        preloadCalled = true;
      })
    };

    const hydrator = new SearchMetadataHydrator(mockGateway);
    const references = Array.from({ length: 60 }, (_, i) => ({
      kind: 'song' as const,
      id: i + 1,
      tier: 6 as const
    }));

    await hydrator.hydrateMatches(references);

    expect(mockGateway.loadMany).toHaveBeenCalled();
    expect(preloadCalled).toBe(true);
  });
});
