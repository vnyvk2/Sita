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
import { SongMapper } from '@main/metadata/mappers/SongMapper';
import { CORE_FIELD_DEFINITIONS } from '@main/metadata/models/CoreFieldDefinitions';
import { MetadataContext } from '@main/metadata/models/MetadataContext';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataPipeline } from '@main/metadata/pipeline/MetadataPipeline';
import { MetadataQueryPlanner } from '@main/metadata/planner/MetadataQueryPlanner';
import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { MetadataProviderExecutor } from '@main/metadata/providers/MetadataProviderExecutor';
import { DefaultMetadataMergePolicy } from '@main/metadata/providers/policies/DefaultMetadataMergePolicy';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';

describe('MetadataEngine with Provider Resolution Pipeline', () => {
  it('should resolve metadata through ProviderExecutor, merge payload, run pipeline, and cache result', async () => {
    const mockSongLoader: IEntityLoader = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Stairway to Heaven', year: 1971 }),
      loadMany: async (ids) =>
        ids.map((id) => ({ id: Number(id), title: 'Stairway to Heaven', year: 1971 }))
    };

    const repository = new DatabaseMetadataRepository([mockSongLoader]);
    const localProvider = new LocalMetadataProvider(repository);
    await localProvider.initialize();

    const providerRegistry = new MetadataProviderRegistry();
    providerRegistry.register(localProvider);

    const eventBus = new MetadataEventBus();
    const executor = new MetadataProviderExecutor({ registry: providerRegistry, eventBus });

    const planner = new MetadataQueryPlanner(repository);
    const mapperRegistry = new MapperRegistry();
    mapperRegistry.register(new SongMapper());
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const cache = new MetadataCache();
    const context = new MetadataContext();

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy: new DefaultValidationPolicy(),
      conflictPolicy: new DefaultConflictPolicy(),
      context
    });

    const engine = new MetadataEngine({
      executor,
      mergePolicy: new DefaultMetadataMergePolicy(),
      planner,
      pipeline,
      cache,
      eventBus,
      context
    });

    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 777 });

    const entity1 = await engine.getEntityMetadata(identity);
    expect(entity1).not.toBeNull();
    expect(entity1?.getField<string>('title')?.value).toBe('Stairway to Heaven');
    expect(cache.size()).toBe(1);

    // Second call should hit cache
    const entity2 = await engine.getEntityMetadata(identity);
    expect(entity2).toBe(entity1);
  });
});
