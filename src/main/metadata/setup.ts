import { libraryEventBus } from '@main/events/LibraryEventBus';

import { MetadataCache } from './cache/MetadataCache';
import { MetadataEngine } from './engine/MetadataEngine';
import { MetadataEventBus } from './events/MetadataEventBus';
import { AlbumMapper } from './mappers/AlbumMapper';
import { ArtistMapper } from './mappers/ArtistMapper';
import { GenreMapper } from './mappers/GenreMapper';
import { MapperRegistry } from './mappers/MapperRegistry';
import { PlaylistMapper } from './mappers/PlaylistMapper';
import { SongMapper } from './mappers/SongMapper';
import { CORE_FIELD_DEFINITIONS } from './models/CoreFieldDefinitions';
import { MetadataContext } from './models/MetadataContext';
import { MetadataIdentity } from './models/MetadataIdentity';
import { MetadataKinds } from './models/MetadataKind';
import { MetadataPipeline } from './pipeline/MetadataPipeline';
import { MetadataQueryPlanner } from './planner/MetadataQueryPlanner';
import { DefaultConflictPolicy } from './policies/DefaultConflictPolicy';
import { DefaultMergePolicy } from './policies/DefaultMergePolicy';
import { DefaultOverwritePolicy } from './policies/DefaultOverwritePolicy';
import { DefaultProviderPriorityPolicy } from './policies/DefaultProviderPriorityPolicy';
import { DefaultValidationPolicy } from './policies/DefaultValidationPolicy';

import { ProviderCircuitBreakerRegistry } from './providers/circuitbreaker/ProviderCircuitBreakerRegistry';
import { ProviderExecutionPipeline } from './providers/execution/ProviderExecutionPipeline';
import { ProviderExecutionPipelineBuilder } from './providers/execution/ProviderExecutionPipelineBuilder';
import { ProviderHealthManager } from './providers/health/ProviderHealthManager';
import { LocalMetadataProvider } from './providers/LocalMetadataProvider';
import { MetadataProviderExecutor } from './providers/MetadataProviderExecutor';
import { DefaultProviderMergePolicy } from './providers/policies/DefaultProviderMergePolicy';
import { ProviderDiagnosticsTracker } from './providers/ProviderDiagnosticsTracker';
import { ProviderRetryPolicy } from './providers/retry/ProviderRetryPolicy';
import { DefaultProviderExecutionStrategy } from './providers/strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from './providers/strategies/DefaultProviderSelectionStrategy';
import { ProviderTimeoutPolicy } from './providers/timeout/ProviderTimeoutPolicy';

import { MetadataMergeEngine } from './engine/MetadataMergeEngine';
import { DefaultMetadataMergePolicy } from './providers/policies/DefaultMetadataMergePolicy';
import { MetadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from './registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from './repository/DatabaseMetadataRepository';
import { LoaderRegistry } from './repository/LoaderRegistry';
import { MetadataSearchGateway } from './search/MetadataSearchGateway';

export interface MetadataContainer {
  engine: MetadataEngine;
  searchGateway: MetadataSearchGateway;
  mergeEngine: MetadataMergeEngine;
  repository: DatabaseMetadataRepository;
  loaderRegistry: LoaderRegistry;
  localProvider: LocalMetadataProvider;
  executor: MetadataProviderExecutor;
  healthManager: ProviderHealthManager;
  circuitBreakerRegistry: ProviderCircuitBreakerRegistry;
  diagnosticsTracker: ProviderDiagnosticsTracker;
  timeoutPolicy: ProviderTimeoutPolicy;
  retryPolicy: ProviderRetryPolicy;
  executionPipeline: ProviderExecutionPipeline;
  executionStrategy: DefaultProviderExecutionStrategy;
  selectionStrategy: DefaultProviderSelectionStrategy;
  providerMergePolicy: DefaultProviderMergePolicy;
  planner: MetadataQueryPlanner;
  pipeline: MetadataPipeline;
  mapperRegistry: MapperRegistry;
  fieldRegistry: MetadataFieldRegistry;
  providerRegistry: MetadataProviderRegistry;
  cache: MetadataCache;
  eventBus: MetadataEventBus;
  policies: {
    validation: DefaultValidationPolicy;
    conflict: DefaultConflictPolicy;
    merge: DefaultMergePolicy;
    overwrite: DefaultOverwritePolicy;
    priority: DefaultProviderPriorityPolicy;
  };
  context: MetadataContext;
}

export class MetadataBootstrap {
  private static instancePromise: Promise<MetadataContainer> | null = null;

  public static async getInstance(contextOptions?: Partial<MetadataContext>): Promise<MetadataContainer> {
    if (!this.instancePromise) {
      this.instancePromise = this.bootstrap(contextOptions);
    }
    return this.instancePromise;
  }

  public static async bootstrap(contextOptions?: Partial<MetadataContext>): Promise<MetadataContainer> {
    const context = new MetadataContext(contextOptions);
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const providerRegistry = new MetadataProviderRegistry();
    const mapperRegistry = new MapperRegistry();
    const loaderRegistry = new LoaderRegistry();
    const eventBus = new MetadataEventBus();
    const cache = new MetadataCache();

    // Register default entity mappers
    mapperRegistry.register(new SongMapper());
    mapperRegistry.register(new ArtistMapper());
    mapperRegistry.register(new AlbumMapper());
    mapperRegistry.register(new GenreMapper());
    mapperRegistry.register(new PlaylistMapper());

    const policies = {
      validation: new DefaultValidationPolicy(),
      conflict: new DefaultConflictPolicy(),
      merge: new DefaultMergePolicy(),
      overwrite: new DefaultOverwritePolicy(),
      priority: new DefaultProviderPriorityPolicy()
    };

    const repository = new DatabaseMetadataRepository(loaderRegistry);
    const localProvider = new LocalMetadataProvider(repository);
    await localProvider.initialize();

    providerRegistry.register(localProvider);

    const healthManager = new ProviderHealthManager(eventBus);
    const circuitBreakerRegistry = new ProviderCircuitBreakerRegistry(eventBus);
    const diagnosticsTracker = new ProviderDiagnosticsTracker(eventBus);

    const timeoutPolicy = new ProviderTimeoutPolicy();
    const retryPolicy = new ProviderRetryPolicy();

    const executionPipeline = new ProviderExecutionPipelineBuilder()
      .withCircuitBreaker(circuitBreakerRegistry)
      .withRetry(retryPolicy)
      .withTimeout(timeoutPolicy)
      .build();

    const selectionStrategy = new DefaultProviderSelectionStrategy();
    const executionStrategy = new DefaultProviderExecutionStrategy(eventBus, executionPipeline);

    const executor = new MetadataProviderExecutor({
      registry: providerRegistry,
      eventBus,
      selectionStrategy,
      executionStrategy
    });

    const providerMergePolicy = new DefaultMetadataMergePolicy();
    const planner = new MetadataQueryPlanner(repository);

    const mergeEngine = new MetadataMergeEngine({
      registry: providerRegistry,
      mergePolicy: providerMergePolicy,
      selectionStrategy,
      executionStrategy
    });

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy: policies.validation,
      conflictPolicy: policies.conflict,
      context
    });

    const engine = new MetadataEngine({
      executor,
      mergePolicy: providerMergePolicy,
      mergeEngine,
      planner,
      pipeline,
      cache,
      eventBus,
      context
    });

    const searchGateway = new MetadataSearchGateway({ gateway: engine });

    libraryEventBus.onEvent('SongMetadataChanged', (event) => {
      const identity = new MetadataIdentity({
        entityKind: MetadataKinds.Song,
        entityId: event.songId
      });
      engine.refreshMetadata(identity).catch((err) => {
        context.logger.warn('Failed to refresh metadata on SongMetadataChanged event', { err });
      });
    });

    libraryEventBus.onEvent('SongRemoved', (event) => {
      const identity = new MetadataIdentity({
        entityKind: MetadataKinds.Song,
        entityId: event.songId
      });
      cache.delete(identity);
    });

    return {
      engine,
      searchGateway,
      mergeEngine,
      repository,
      loaderRegistry,
      localProvider,
      executor,
      healthManager,
      circuitBreakerRegistry,
      diagnosticsTracker,
      timeoutPolicy,
      retryPolicy,
      executionPipeline,
      executionStrategy,
      selectionStrategy,
      providerMergePolicy: providerMergePolicy as any,
      planner,
      pipeline,
      mapperRegistry,
      fieldRegistry,
      providerRegistry,
      cache,
      eventBus,
      policies,
      context
    };
  }
}
