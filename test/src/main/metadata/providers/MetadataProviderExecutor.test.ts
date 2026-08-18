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

import { MetadataCapabilities } from '@main/metadata/common/types';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderExecutionContext } from '@main/metadata/models/ProviderExecutionContext';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { LocalMetadataProvider } from '@main/metadata/providers/LocalMetadataProvider';
import { MetadataProviderExecutor } from '@main/metadata/providers/MetadataProviderExecutor';
import { MetadataProviderRegistry } from '@main/metadata/registries/MetadataProviderRegistry';
import type { IEntityLoader } from '@main/metadata/repository/strategies/IEntityLoader';
import { DatabaseMetadataRepository } from '@main/metadata/repository/DatabaseMetadataRepository';
import type { IMetadataProvider } from '@main/metadata/interfaces/IMetadataProvider';

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
    const results = await executor.execute<SongPersistenceDTO>(identity, MetadataCapabilities.Tags);

    expect(results.length).toBe(1);
    expect(results[0].payload?.title).toBe('Starman');

    // Test cancellation token skip
    let skippedFired = false;
    eventBus.on('ProviderSkipped', () => {
      skippedFired = true;
    });

    const cancelledContext = new ProviderExecutionContext({ cancellationToken: { isCancelled: true } });
    const skippedResults = await executor.execute<SongPersistenceDTO>(identity, MetadataCapabilities.Tags, cancelledContext);

    expect(skippedResults.length).toBe(1);
    expect(skippedResults[0].status).toBe('skipped');
    expect(skippedFired).toBe(true);
  });

  it('executes providers strictly in descending priority order (BUG-04)', async () => {
    const executionOrder: string[] = [];

    const providerHigh: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'high-priority', displayName: 'High Priority', priority: 100 }),
      initialize: async () => { providerHigh.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async (id) => {
        executionOrder.push('high-priority');
        return new ProviderResult({
          payload: { id: 1, title: 'High' },
          confidence: MetadataConfidence.default(),
          providerInfo: providerHigh.info,
          latencyMs: 5,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };
    await providerHigh.initialize();

    const providerLow: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'low-priority', displayName: 'Low Priority', priority: 50 }),
      initialize: async () => { providerLow.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async (id) => {
        executionOrder.push('low-priority');
        return new ProviderResult({
          payload: { id: 1, title: 'Low' },
          confidence: MetadataConfidence.default(),
          providerInfo: providerLow.info,
          latencyMs: 5,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };
    await providerLow.initialize();

    const registry = new MetadataProviderRegistry();
    // Register low priority first, high priority second
    registry.register(providerLow);
    registry.register(providerHigh);

    const executor = new MetadataProviderExecutor({ registry, eventBus: new MetadataEventBus() });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });

    const results = await executor.execute(identity, MetadataCapabilities.Tags);

    expect(results).toHaveLength(2);
    expect(executionOrder).toEqual(['high-priority', 'low-priority']);
  });

  it('skips lower priority provider if execution is cancelled during execution (BUG-08)', async () => {
    const token = { isCancelled: false };
    const executedProviders: string[] = [];

    const providerA: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'provider-a', displayName: 'Provider A', priority: 100 }),
      initialize: async () => { providerA.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executedProviders.push('provider-a');
        // Cancel token mid-execution
        token.isCancelled = true;
        return new ProviderResult({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: providerA.info,
          latencyMs: 5,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };
    await providerA.initialize();

    const providerB: IMetadataProvider = {
      info: new MetadataProviderInfo({ id: 'provider-b', displayName: 'Provider B', priority: 50 }),
      initialize: async () => { providerB.info.setReady(); },
      supports: (c) => c === MetadataCapabilities.Tags,
      getCapabilities: () => new Set([MetadataCapabilities.Tags]),
      fetch: async () => {
        executedProviders.push('provider-b');
        return new ProviderResult({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: providerB.info,
          latencyMs: 5,
          status: 'success'
        });
      },
      fetchMany: async () => []
    };
    await providerB.initialize();

    const registry = new MetadataProviderRegistry();
    registry.register(providerA);
    registry.register(providerB);

    const executor = new MetadataProviderExecutor({ registry, eventBus: new MetadataEventBus() });
    const execContext = new ProviderExecutionContext({ cancellationToken: token });
    const identity = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });

    const results = await executor.execute(identity, MetadataCapabilities.Tags, execContext);

    expect(executedProviders).toEqual(['provider-a']);
    expect(results).toHaveLength(2);
    expect(results[1].status).toBe('skipped');
    expect(results[1].error).toContain('cancelled');
  });
});
