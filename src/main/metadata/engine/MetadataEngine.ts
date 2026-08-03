import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataGateway } from '../interfaces/IMetadataGateway';
import type { IMetadataProviderExecutor } from '../interfaces/IMetadataProviderExecutor';
import type { MetadataCache } from '../cache/MetadataCache';
import type { MetadataContext } from '../models/MetadataContext';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataQuery } from '../models/MetadataQuery';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';
import type { MetadataPipeline } from '../pipeline/MetadataPipeline';
import type { MetadataQueryPlanner } from '../planner/MetadataQueryPlanner';
import type { ProviderMergePolicy } from '../providers/policies/ProviderMergePolicy';

import { DefaultProviderMergePolicy } from '../providers/policies/DefaultProviderMergePolicy';

export interface MetadataEngineOptions {
  executor: IMetadataProviderExecutor;
  mergePolicy?: ProviderMergePolicy;
  planner: MetadataQueryPlanner;
  pipeline: MetadataPipeline;
  cache: MetadataCache;
  eventBus: MetadataEventBus;
  context: MetadataContext;
}

export class MetadataEngine implements IMetadataGateway {
  private readonly executor: IMetadataProviderExecutor;
  private readonly mergePolicy: ProviderMergePolicy;
  private readonly planner: MetadataQueryPlanner;
  private readonly pipeline: MetadataPipeline;
  private readonly cache: MetadataCache;
  private readonly eventBus: MetadataEventBus;
  private readonly context: MetadataContext;

  constructor(options: MetadataEngineOptions) {
    this.executor = options.executor;
    this.mergePolicy = options.mergePolicy ?? new DefaultProviderMergePolicy();
    this.planner = options.planner;
    this.pipeline = options.pipeline;
    this.cache = options.cache;
    this.eventBus = options.eventBus;
    this.context = options.context;
  }

  public async getEntityMetadata(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null> {
    return this.load(identity, execContext);
  }

  public async load(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null> {
    const cached = this.cache.get(identity);
    if (cached) {
      return cached;
    }

    const providerResults = await this.executor.execute(
      identity,
      'ReadDatabase',
      execContext
    );

    const mergedPayload = this.mergePolicy.merge(providerResults);
    if (!mergedPayload) {
      return null;
    }

    const entity = await this.pipeline.processDTO(
      identity.entityKind,
      mergedPayload,
      null
    );

    if (entity) {
      this.cache.set(entity);
      this.publishEntity(entity, 'MetadataLoaded');
    }
    return entity;
  }

  public async loadMany(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity[]> {
    if (identities.length === 0) return [];

    const loadedEntitiesMap = new Map<string, MetadataEntity>();
    const cacheMisses: MetadataIdentity[] = [];

    // Step 1: Partition into cache hits and cache misses
    for (const identity of identities) {
      const cached = this.cache.get(identity);
      if (cached) {
        loadedEntitiesMap.set(identity.metadataId, cached);
      } else {
        cacheMisses.push(identity);
      }
    }

    // Step 2: Batch fetch cache misses via executor.executeMany using ProviderBatchResult
    if (cacheMisses.length > 0) {
      const batchResultsList = await this.executor.executeMany<unknown>(
        cacheMisses,
        'ReadDatabase',
        execContext
      );

      for (let i = 0; i < cacheMisses.length; i++) {
        const identity = cacheMisses[i];

        const singleProviderResults: ProviderResult[] = batchResultsList
          .map((batch) => batch.results[i])
          .filter((res): res is ProviderResult => res !== undefined && res !== null);

        const mergedPayload = this.mergePolicy.merge(singleProviderResults);
        if (mergedPayload) {
          const entity = await this.pipeline.processDTO(
            identity.entityKind,
            mergedPayload,
            null
          );
          if (entity) {
            this.cache.set(entity);
            this.publishEntity(entity, 'MetadataLoaded');
            loadedEntitiesMap.set(identity.metadataId, entity);
          }
        }
      }
    }

    // Step 3: Reconstruct final list in exact original requested order
    const finalOrderedEntities: MetadataEntity[] = [];
    for (const identity of identities) {
      const entity = loadedEntitiesMap.get(identity.metadataId);
      if (entity) {
        finalOrderedEntities.push(entity);
      }
    }

    return finalOrderedEntities;
  }

  public async refresh(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null> {
    const providerResults = await this.executor.refresh(
      identity,
      'ReadDatabase',
      execContext
    );

    const mergedPayload = this.mergePolicy.merge(providerResults);
    if (!mergedPayload) {
      return null;
    }

    const entity = await this.pipeline.processDTO(
      identity.entityKind,
      mergedPayload,
      null
    );

    if (entity) {
      this.cache.set(entity);
      this.publishEntity(entity, 'MetadataRefreshed');
    }
    return entity;
  }

  public async refreshMany(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity[]> {
    if (identities.length === 0) return [];
    const refreshedEntities: MetadataEntity[] = [];
    for (const identity of identities) {
      const refreshed = await this.refresh(identity, execContext);
      if (refreshed) refreshedEntities.push(refreshed);
    }
    return refreshedEntities;
  }

  public async refreshMetadata(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<MetadataEntity | null> {
    return this.refresh(identity, execContext);
  }

  public preload(
    identities: MetadataIdentity[],
    execContext?: ProviderExecutionContext
  ): void {
    if (identities.length === 0) return;
    // Non-blocking background cache warming
    this.loadMany(identities, execContext).catch((err) => {
      this.context.logger.warn('Failed background preload', { err });
    });
  }

  public async query(query: MetadataQuery): Promise<MetadataEntity[]> {
    const plannedIdentities = await this.planner.plan(query);
    return this.loadMany(plannedIdentities);
  }

  private publishEntity(
    entity: MetadataEntity,
    eventType: 'MetadataLoaded' | 'MetadataCreated' | 'MetadataRefreshed'
  ): void {
    this.eventBus.emit(eventType, {
      identity: entity.identity,
      entity
    });
  }
}
