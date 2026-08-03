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

import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { ProviderExecutionContext } from '@main/metadata/models/ProviderExecutionContext';
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { MetadataProviderExecutor } from '@main/metadata/providers/MetadataProviderExecutor';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';

describe('MetadataProviderExecutor', () => {
  it('should execute registered providers sorted by priority and handle cancellation', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Starman' }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: 'Starman' }))
    };

    const repository = new DatabaseMetadataRepository([mockLoader as IEntityLoader<unknown>]);
    const localProvider = new LocalMetadataProvider(repository);
    await localProvider.initialize();

    const registry = new MetadataProviderRegistry();
    registry.register(localProvider);

    const eventBus = new MetadataEventBus();
    const executor = new MetadataProviderExecutor({ registry, eventBus });

    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });
    const results = await executor.execute<SongPersistenceDTO>(identity, 'ReadDatabase');

    expect(results.length).toBe(1);
    expect(results[0].payload?.title).toBe('Starman');

    // Test cancellation token skip
    let skippedFired = false;
    eventBus.on('ProviderSkipped', () => {
      skippedFired = true;
    });

    const cancelledContext = new ProviderExecutionContext({ cancellationToken: { isCancelled: true } });
    const skippedResults = await executor.execute<SongPersistenceDTO>(identity, 'ReadDatabase', cancelledContext);

    expect(skippedResults.length).toBe(0);
    expect(skippedFired).toBe(true);
  });
});
