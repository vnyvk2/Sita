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
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';

describe('DatabaseMetadataRepository', () => {
  it('should find DTO using registered strategy loaders', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Hotel California' }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: 'Hotel California' }))
    };

    const repository = new DatabaseMetadataRepository([mockLoader as IEntityLoader<unknown>]);
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 10 });

    const dto = await repository.findDTO<SongPersistenceDTO>(identity);
    expect(dto).not.toBeNull();
    expect(dto?.title).toBe('Hotel California');

    const dtos = await repository.findManyDTO<SongPersistenceDTO>(MetadataKinds.Song, [10, 11]);
    expect(dtos.length).toBe(2);
  });

  it('should throw explicit Phase 2 errors on write operations', async () => {
    const repository = new DatabaseMetadataRepository();
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });

    await expect(repository.find(identity)).rejects.toThrow();
    await expect(repository.store({} as any)).rejects.toThrow();
    await expect(repository.update({} as any)).rejects.toThrow();
    await expect(repository.remove(identity)).rejects.toThrow();
  });
});
