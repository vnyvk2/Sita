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
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataQuery } from '@main/metadata/models/MetadataQuery';
import { MetadataQueryPlanner } from '@main/metadata/planner/MetadataQueryPlanner';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';

describe('MetadataQueryPlanner', () => {
  it('should plan and execute queries targeting loaders', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Imagine' }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: 'Imagine' }))
    };

    const repository = new DatabaseMetadataRepository([mockLoader as IEntityLoader<unknown>]);
    const planner = new MetadataQueryPlanner(repository);

    const query = new MetadataQuery({ kind: MetadataKinds.Song, filter: { id: 99 } });
    const result = await planner.executePlan<SongPersistenceDTO>(query);

    expect(result.kind).toBe(MetadataKinds.Song);
    expect(result.dtos.length).toBe(1);
    expect(result.dtos[0].title).toBe('Imagine');
  });
});
