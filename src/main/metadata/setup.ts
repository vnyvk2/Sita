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
import { ProviderDiagnosticsTracker } from './providers/ProviderDiagnosticsTracker';
import { ProviderRetryPolicy } from './providers/retry/ProviderRetryPolicy';
import { DefaultProviderExecutionStrategy } from './providers/strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from './providers/strategies/DefaultProviderSelectionStrategy';
import { ProviderTimeoutPolicy } from './providers/timeout/ProviderTimeoutPolicy';

import { MetadataMergeEngine } from './engine/MetadataMergeEngine';
import { DefaultMetadataMergePolicy } from './providers/policies/DefaultMetadataMergePolicy';
import { UserMetadataProvider } from './providers/UserMetadataProvider';
import { MetadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from './registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from './repository/DatabaseMetadataRepository';
import { LoaderRegistry } from './repository/LoaderRegistry';
import { UserMetadataRepository } from './repository/UserMetadataRepository';
import { MetadataSearchGateway } from './search/MetadataSearchGateway';
import { PlatformBootstrap } from '../platform/PlatformBootstrap';
import { RateLimiter, RetryPolicy, RequestPipeline } from '../platform/networking';
import updateSongId3Tags from '../updateSong/updateSongId3Tags';
import { SongMetadataBuilder } from './transactions/SongMetadataBuilder';
import { IdentityResolutionCache } from './cache/IdentityResolutionCache';
import { LocalMetadataAdapter } from './providers/adapters/LocalMetadataAdapter';
import { UserMetadataAdapter } from './providers/adapters/UserMetadataAdapter';
import { MusicBrainzAdapter, MusicBrainzApiClient } from './providers/musicbrainz';
import { DiscogsAdapter } from './providers/discogs/DiscogsAdapter';
import { DiscogsApiClient } from './providers/discogs/DiscogsApiClient';
import { CoverArtArchiveAdapter } from './providers/coverartarchive/CoverArtArchiveAdapter';
import { CaaApiClient } from './providers/coverartarchive/CaaApiClient';
import { DefaultMetadataLookupGateway } from './resolution/MetadataLookupGateway';
import { MetadataResolutionManager } from './resolution/MetadataResolutionManager';
import { ProviderRegistry as ResolutionProviderRegistry } from './resolution/ProviderRegistry';
import { MetadataProviderDiscovery } from './runtime/MetadataProviderDiscovery';
import { MetadataProviderRegistry as RuntimeMetadataProviderRegistry } from './runtime/MetadataProviderRegistry';
import { MetadataProviderRuntime } from './runtime/MetadataProviderRuntime';
import { AlbumAutoTagService } from './services/AlbumAutoTagService';
import { AlbumMetadataService } from './services/AlbumMetadataService';
import { MetadataApplyService } from './services/MetadataApplyService';
import { UserMetadataService } from './services/UserMetadataService';
import { MetadataWorkflowService } from './services/MetadataWorkflowService';
import { AlbumWorkflow } from './workflows/strategies/AlbumWorkflow';
import { GenreWorkflow } from './workflows/strategies/GenreWorkflow';
import { ArtworkWorkflow } from './workflows/strategies/ArtworkWorkflow';
import { TrackWorkflow } from './workflows/strategies/TrackWorkflow';
import { MetadataTransactionManager } from './transactions/MetadataTransactionManager';

export interface MetadataContainer {
  engine: MetadataEngine;
  searchGateway: MetadataSearchGateway;
  mergeEngine: MetadataMergeEngine;
  repository: DatabaseMetadataRepository;
  userRepository: UserMetadataRepository;
  userProvider: UserMetadataProvider;
  userService: UserMetadataService;
  loaderRegistry: LoaderRegistry;
  localProvider: LocalMetadataProvider;
  identityCache: IdentityResolutionCache;
  providerDiscovery: MetadataProviderDiscovery;
  executor: MetadataProviderExecutor;
  healthManager: ProviderHealthManager;
  circuitBreakerRegistry: ProviderCircuitBreakerRegistry;
  diagnosticsTracker: ProviderDiagnosticsTracker;
  timeoutPolicy: ProviderTimeoutPolicy;
  retryPolicy: ProviderRetryPolicy;
  executionPipeline: ProviderExecutionPipeline;
  executionStrategy: DefaultProviderExecutionStrategy;
  selectionStrategy: DefaultProviderSelectionStrategy;
  providerMergePolicy: DefaultMetadataMergePolicy;
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
  application: {
    userService: UserMetadataService;
    albumMetadataService: AlbumMetadataService;
    autoTagService: AlbumAutoTagService;
    workflowService: MetadataWorkflowService;
    applyService: MetadataApplyService;
  };
  resolution: {
    resolutionManager: MetadataResolutionManager;
    lookupGateway: DefaultMetadataLookupGateway;
  };
  infrastructure: {
    requestPipeline: RequestPipeline;
  };
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
    const runtimeProviderRegistry = new RuntimeMetadataProviderRegistry();
    const mapperRegistry = new MapperRegistry();
    const loaderRegistry = new LoaderRegistry();
    const eventBus = new MetadataEventBus();
    const cache = new MetadataCache();

    const identityCache = new IdentityResolutionCache();
    const providerDiscovery = new MetadataProviderDiscovery(runtimeProviderRegistry);

    // Single shared networking pipeline for remote providers
    const platform = PlatformBootstrap.getInstance();
    const requestPipeline = platform.createRequestPipeline({
      rateLimiter: new RateLimiter({ maxRequests: 1, perIntervalMs: 1000 }),
      retryPolicy: new RetryPolicy({ maxRetries: 3, initialDelayMs: 1000 })
    });

    const mbApiClient = new MusicBrainzApiClient(requestPipeline);
    const musicBrainzAdapter = new MusicBrainzAdapter(mbApiClient, { cache: identityCache });

    const discogsApiClient = new DiscogsApiClient(requestPipeline);
    const discogsAdapter = new DiscogsAdapter(discogsApiClient, { cache: identityCache });

    const caaApiClient = new CaaApiClient(requestPipeline);
    const coverArtArchiveAdapter = new CoverArtArchiveAdapter(caaApiClient, { cache: identityCache });

    const resolutionProviderRegistry = new ResolutionProviderRegistry();
    resolutionProviderRegistry.registerInstance('musicbrainz', musicBrainzAdapter as any);
    resolutionProviderRegistry.registerInstance('discogs', discogsAdapter as any);
    resolutionProviderRegistry.registerInstance('coverartarchive', coverArtArchiveAdapter as any);

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

    const userRepository = new UserMetadataRepository();
    const userProvider = new UserMetadataProvider(userRepository);
    await userProvider.initialize();

    providerRegistry.register(localProvider);
    providerRegistry.register(userProvider);

    providerDiscovery.registerFactory('local-file-provider', () => new LocalMetadataAdapter(localProvider));
    providerDiscovery.registerFactory('user-override-provider', () => new UserMetadataAdapter(userProvider));
    providerDiscovery.registerFactory('musicbrainz', () => musicBrainzAdapter);

    await providerDiscovery.discoverAll({
      'local-file-provider': { enabled: true, priority: 100 },
      'user-override-provider': { enabled: true, priority: 1000 },
      'musicbrainz': { enabled: true, priority: 500 }
    });

    const userService = new UserMetadataService(userRepository, eventBus);

    // AutoTag Application & Resolution Services construction inside MetadataBootstrap composition root
    const providerRuntime = new MetadataProviderRuntime(musicBrainzAdapter);
    await providerRuntime.initialize();

    const albumMetadataService = new AlbumMetadataService(providerRuntime);
    const applyService = new MetadataApplyService({
      dbUpdater: async (songId, data) => {
        const completeTags = await SongMetadataBuilder.buildCompleteTags(songId, data);
        await updateSongId3Tags(songId, completeTags, true, true);
      }
    });

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

    const lookupGateway = new DefaultMetadataLookupGateway(executor, resolutionProviderRegistry);
    const resolutionManager = new MetadataResolutionManager({
      lookupGateway,
      providerRegistry: resolutionProviderRegistry
    });

    const autoTagService = new AlbumAutoTagService({
      albumMetadataService,
      applyService,
      resolutionManager
    });

    const transactionManager = new MetadataTransactionManager({
      dbUpdater: async (songId, data) => {
        const completeTags = await SongMetadataBuilder.buildCompleteTags(songId, data);
        await updateSongId3Tags(songId, completeTags, true, true);
      },
      requestPipeline
    });

    const workflowService = new MetadataWorkflowService({
      transactionManager
    });

    workflowService.registerWorkflow(new AlbumWorkflow(albumMetadataService));
    workflowService.registerWorkflow(new GenreWorkflow(discogsAdapter));
    workflowService.registerWorkflow(new ArtworkWorkflow(coverArtArchiveAdapter, discogsAdapter, musicBrainzAdapter));
    workflowService.registerWorkflow(new TrackWorkflow(musicBrainzAdapter));

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

    eventBus.on('MetadataOverrideChanged', (event) => {
      cache.delete(event.identity);
    });

    return {
      engine,
      searchGateway,
      mergeEngine,
      repository,
      userRepository,
      userProvider,
      userService,
      loaderRegistry,
      localProvider,
      identityCache,
      providerDiscovery,
      executor,
      healthManager,
      circuitBreakerRegistry,
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
      context,
      application: {
        userService,
        albumMetadataService,
        autoTagService,
        workflowService,
        applyService
      },
      resolution: {
        resolutionManager,
        lookupGateway
      },
      infrastructure: {
        requestPipeline
      }
    };
  }
}
