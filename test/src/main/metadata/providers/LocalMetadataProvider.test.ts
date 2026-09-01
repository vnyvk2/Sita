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
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';

describe('LocalMetadataProvider', () => {
  it('should fetch raw persistence DTO inside ProviderResult', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Hotel California', year: 1976 }),
      loadMany: async (ids) =>
        ids.map((id) => ({ id: Number(id), title: 'Hotel California', year: 1976 }))
    };

    const repository = new DatabaseMetadataRepository([mockLoader as IEntityLoader<unknown>]);
    const provider = new LocalMetadataProvider(repository);
    await provider.initialize();

    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });
    const result = await provider.fetch<SongPersistenceDTO>(identity);

    expect(result.status).toBe('success');
    expect(result.payload?.title).toBe('Hotel California');
    expect(result.confidence.score).toBe(1.0);
    expect(result.providerInfo.id).toBe('local');
  });
});
