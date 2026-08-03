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
import { MetadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from './registries/MetadataProviderRegistry';
import { DatabaseMetadataRepository } from './repository/DatabaseMetadataRepository';

export interface MetadataContainer {
  engine: MetadataEngine;
  repository: DatabaseMetadataRepository;
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
  public static bootstrap(contextOptions?: Partial<MetadataContext>): MetadataContainer {
    const context = new MetadataContext(contextOptions);
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const providerRegistry = new MetadataProviderRegistry();
    const mapperRegistry = new MapperRegistry();
    const eventBus = new MetadataEventBus();
    const cache = new MetadataCache();

    const policies = {
      validation: new DefaultValidationPolicy(),
      conflict: new DefaultConflictPolicy(),
      merge: new DefaultMergePolicy(),
      overwrite: new DefaultOverwritePolicy(),
      priority: new DefaultProviderPriorityPolicy()
    };

    const repository = new DatabaseMetadataRepository();
    const planner = new MetadataQueryPlanner(repository);

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy: policies.validation,
      conflictPolicy: policies.conflict,
      cache,
      eventBus
    });

    const engine = new MetadataEngine({
      repository,
      planner,
      pipeline,
      cache,
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
