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
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { CircuitBreakerStage } from '@main/metadata/providers/execution/stages/CircuitBreakerStage';
import { RetryStage } from '@main/metadata/providers/execution/stages/RetryStage';
import { TimeoutStage } from '@main/metadata/providers/execution/stages/TimeoutStage';
import { ProviderExecutionPipeline } from '@main/metadata/providers/execution/ProviderExecutionPipeline';
import { ProviderExecutionStageContext } from '@main/metadata/providers/execution/ProviderExecutionStageContext';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';

describe('ProviderExecutionPipeline', () => {
  it('should process provider execution through pipeline stages', async () => {
    const mockLoader: IEntityLoader<SongPersistenceDTO> = {
      kind: MetadataKinds.Song,
      load: async (id) => ({ id: Number(id), title: 'Pipeline Test Song' }),
      loadMany: async (ids) => ids.map((id) => ({ id: Number(id), title: 'Pipeline Test Song' }))
    };

    const repository = new DatabaseMetadataRepository([mockLoader as IEntityLoader<unknown>]);
    const localProvider = new LocalMetadataProvider(repository);
    await localProvider.initialize();

    const eventBus = new MetadataEventBus();
    const pipeline = new ProviderExecutionPipeline([
      new CircuitBreakerStage(),
      new RetryStage(),
      new TimeoutStage()
    ]);

    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });
    const context = new ProviderExecutionStageContext<SongPersistenceDTO>({
      provider: localProvider,
      identity,
      eventBus,
      action: (p, id) => p.fetch<SongPersistenceDTO>(id)
    });

    const result = await pipeline.process<SongPersistenceDTO>(context);
    expect(result.status).toBe('success');
    expect(result.payload?.title).toBe('Pipeline Test Song');
  });
});
