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

import { SongMapper } from '@main/metadata/mappers/SongMapper';
import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { MetadataSearchGateway } from '@main/metadata/search/MetadataSearchGateway';
import { MetadataBootstrap } from '@main/metadata/setup';

describe('MetadataSearchGateway', () => {
  it('should hydrate search results via IMetadataGateway and MetadataEngine batch loading', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) =>
        ({
          id: Number(id),
          title: `Gateway Song ${id}`,
          duration: 180,
          path: '/test.mp3',
          artworks: [],
          artists: [],
          albums: [],
          genres: []
        }) as any,
      loadMany: async (ids) =>
        ids.map(
          (id) =>
            ({
              id: Number(id),
              title: `Gateway Song ${id}`,
              duration: 180,
              path: '/test.mp3',
              artworks: [],
              artists: [],
              albums: [],
              genres: []
            }) as any
        )
    };

    const container = await MetadataBootstrap.bootstrap();
    container.loaderRegistry.register(mockLoader as IEntityLoader<unknown>);
    container.mapperRegistry.register(new SongMapper());

    const gateway = container.searchGateway;
    const hydrated = await gateway.hydrateReferences<SongPersistenceDTO>([
      { kind: 'song', id: 1, tier: 6 },
      { kind: 'song', id: 2, tier: 6 }
    ]);

    expect(hydrated.length).toBe(2);
    expect(hydrated[0].title).toBe('Gateway Song 1');
    expect(hydrated[1].title).toBe('Gateway Song 2');
  });
});
