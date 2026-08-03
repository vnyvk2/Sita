import { libraryEventBus } from '@main/events/LibraryEventBus';

import { MetadataCache } from './cache/MetadataCache';
import { MetadataEngine } from './engine/MetadataEngine';
import { MetadataEventBus } from './events/MetadataEventBus';
import { MapperRegistry } from './mappers/MapperRegistry';
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

import { CircuitBreakerStage } from './providers/execution/stages/CircuitBreakerStage';
import { RetryStage } from './providers/execution/stages/RetryStage';
import { TimeoutStage } from './providers/execution/stages/TimeoutStage';
import { ProviderExecutionPipeline } from './providers/execution/ProviderExecutionPipeline';
import { ProviderHealthManager } from './providers/health/ProviderHealthManager';
import { LocalMetadataProvider } from './providers/LocalMetadataProvider';
import { MetadataProviderExecutor } from './providers/MetadataProviderExecutor';
import { DefaultProviderMergePolicy } from './providers/policies/DefaultProviderMergePolicy';
import { ProviderDiagnosticsTracker } from './providers/ProviderDiagnosticsTracker';
import { ProviderRetryPolicy } from './providers/retry/ProviderRetryPolicy';
import { DefaultProviderExecutionStrategy } from './providers/strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from './providers/strategies/DefaultProviderSelectionStrategy';
import { ProviderTimeoutPolicy } from './providers/timeout/ProviderTimeoutPolicy';

import { MetadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from './registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from './repository/DatabaseMetadataRepository';
import { LoaderRegistry } from './repository/LoaderRegistry';

export interface MetadataContainer {
  engine: MetadataEngine;
  repository: DatabaseMetadataRepository;
  loaderRegistry: LoaderRegistry;
  localProvider: LocalMetadataProvider;
  executor: MetadataProviderExecutor;
  healthManager: ProviderHealthManager;
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
  public static async bootstrap(contextOptions?: Partial<MetadataContext>): Promise<MetadataContainer> {
    const context = new MetadataContext(contextOptions);
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const providerRegistry = new MetadataProviderRegistry();
    const mapperRegistry = new MapperRegistry();
    const loaderRegistry = new LoaderRegistry();
    const eventBus = new MetadataEventBus();
    const cache = new MetadataCache();

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
    const diagnosticsTracker = new ProviderDiagnosticsTracker(eventBus);

    const timeoutPolicy = new ProviderTimeoutPolicy();
    const retryPolicy = new ProviderRetryPolicy();

    const executionPipeline = new ProviderExecutionPipeline([
      new CircuitBreakerStage(),
      new RetryStage(retryPolicy),
      new TimeoutStage(timeoutPolicy)
    ]);

    const selectionStrategy = new DefaultProviderSelectionStrategy();
    const executionStrategy = new DefaultProviderExecutionStrategy(eventBus, executionPipeline);

    const executor = new MetadataProviderExecutor({
      registry: providerRegistry,
      eventBus,
      selectionStrategy,
      executionStrategy
    });

    const providerMergePolicy = new DefaultProviderMergePolicy();
    const planner = new MetadataQueryPlanner(repository);

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
      planner,
      pipeline,
      cache,
      eventBus,
      context
    });

    // Subscribe directly to public LibraryEventBus events to trigger metadata refreshes/invalidations
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
      repository,
      loaderRegistry,
      localProvider,
      executor,
      healthManager,
      diagnosticsTracker,
      timeoutPolicy,
      retryPolicy,
      executionPipeline,
      executionStrategy,
      selectionStrategy,
      providerMergePolicy,
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
