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

import { MetadataCache } from '@main/metadata/cache/MetadataCache';
import { MetadataEngine } from '@main/metadata/engine/MetadataEngine';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MapperRegistry } from '@main/metadata/mappers/MapperRegistry';
import { CORE_FIELD_DEFINITIONS } from '@main/metadata/models/CoreFieldDefinitions';
import { MetadataContext } from '@main/metadata/models/MetadataContext';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataPipeline } from '@main/metadata/pipeline/MetadataPipeline';
import { MetadataQueryPlanner } from '@main/metadata/planner/MetadataQueryPlanner';
import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';

describe('MetadataEngine', () => {
  it('should fetch metadata via engine, hit cache on second call, and refresh on demand', async () => {
    const mockSongLoader: IEntityLoader = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Stairway to Heaven', year: 1971 }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: 'Stairway to Heaven', year: 1971 }))
    };

    const repository = new DatabaseMetadataRepository([mockSongLoader]);
    const planner = new MetadataQueryPlanner(repository);
    const mapperRegistry = new MapperRegistry();
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const cache = new MetadataCache();
    const eventBus = new MetadataEventBus();
    const context = new MetadataContext();

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy: new DefaultValidationPolicy(),
      conflictPolicy: new DefaultConflictPolicy(),
      context
    });

    const engine = new MetadataEngine({ repository, planner, pipeline, cache, eventBus, context });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 777 });

    const entity1 = await engine.getEntityMetadata(identity);
    expect(entity1).not.toBeNull();
    expect(entity1?.getField<string>('title')?.value).toBe('Stairway to Heaven');
    expect(cache.size()).toBe(1);

    // Second call should return cached instance
    const entity2 = await engine.getEntityMetadata(identity);
    expect(entity2).toBe(entity1);

    // Refresh metadata clears cache and re-fetches
    const refreshed = await engine.refreshMetadata(identity);
    expect(refreshed).not.toBeNull();
    expect(refreshed.getField<string>('title')?.value).toBe('Stairway to Heaven');
  });
});
