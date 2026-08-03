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

import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { SongMapper } from '@main/metadata/mappers/SongMapper';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataSearchGateway } from '@main/metadata/search/MetadataSearchGateway';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { MetadataBootstrap } from '@main/metadata/setup';

describe('MetadataSearchGateway', () => {
  it('should hydrate search results via IMetadataGateway and MetadataEngine batch loading', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: `Gateway Song ${id}` }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: `Gateway Song ${id}` }))
    };

    const container = await MetadataBootstrap.bootstrap();
    container.loaderRegistry.register(mockLoader as IEntityLoader<unknown>);
    container.mapperRegistry.register(new SongMapper());

    const gateway = container.searchGateway;
    const hydrated = await gateway.hydrateSearchResults<SongPersistenceDTO>([
      { kind: 'song', id: 1 },
      { kind: 'song', id: 2 }
    ]);

    expect(hydrated.length).toBe(2);
    expect(hydrated[0].title).toBe('Gateway Song 1');
    expect(hydrated[1].title).toBe('Gateway Song 2');
  });
});
