import { describe, expect, it, vi } from 'vitest';

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
    const references = Array.from({ length: 60 }, (_, i) => ({ kind: 'song', id: i + 1 }));

    await hydrator.hydrateMatches(references);

    expect(mockGateway.loadMany).toHaveBeenCalled();
    expect(preloadCalled).toBe(true);
  });
});
