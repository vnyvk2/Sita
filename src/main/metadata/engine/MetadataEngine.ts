import type { MetadataCache } from '../cache/MetadataCache';
import type { MetadataEventMap } from '../events/MetadataEvents';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataEngine } from '../interfaces/IMetadataEngine';
import type { IMetadataProviderExecutor } from '../interfaces/IMetadataProviderExecutor';
import type { MetadataContext } from '../models/MetadataContext';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataQuery } from '../models/MetadataQuery';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { MetadataPipeline } from '../pipeline/MetadataPipeline';
import type { MetadataQueryPlanner } from '../planner/MetadataQueryPlanner';
import type { IProviderMergePolicy } from '../providers/policies/ProviderMergePolicy';

import { DefaultProviderMergePolicy } from '../providers/policies/DefaultProviderMergePolicy';

export interface MetadataEngineOptions {
  executor: IMetadataProviderExecutor;
  mergePolicy?: IProviderMergePolicy;
  planner: MetadataQueryPlanner;
  pipeline: MetadataPipeline;
  cache: MetadataCache;
  eventBus: MetadataEventBus;
  context: MetadataContext;
}

export class MetadataEngine implements IMetadataEngine {
  private readonly executor: IMetadataProviderExecutor;
  private readonly mergePolicy: IProviderMergePolicy;
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
    const cached = this.cache.get(identity);
    if (cached) {
      this.context.logger.debug(`Cache hit for metadata: ${identity.metadataId}`);
      return cached;
    }

    const providerResults = await this.executor.execute(
      identity,
      'ReadDatabase',
      execContext
    );

    const mergedDTO = this.mergePolicy.merge(providerResults);
    if (!mergedDTO) {
      this.context.logger.debug(`No provider DTO resolved for identity: ${identity.metadataId}`);
      return null;
    }

    const entity = await this.pipeline.processDTO(identity.entityKind, mergedDTO, null);
    if (entity) {
      this.publishEntity(entity, 'MetadataLoaded');
    }

    return entity;
  }

  public async getEntitiesMetadata(identities: MetadataIdentity[]): Promise<MetadataEntity[]> {
    const results = await Promise.all(
      identities.map((identity) => this.getEntityMetadata(identity))
    );
    return results.filter((entity): entity is MetadataEntity => entity !== null);
  }

  public async query(query: MetadataQuery): Promise<MetadataEntity[]> {
    const planResult = await this.planner.executePlan(query);
    const dtos = planResult.dtos;

    const entities = await Promise.all(
      dtos.map(async (dto) => {
        const entity = await this.pipeline.processDTO(query.kind, dto, null);
        if (entity) {
          this.publishEntity(entity, 'MetadataLoaded');
        }
        return entity;
      })
    );

    return entities.filter((entity): entity is MetadataEntity => entity !== null);
  }

  public async refreshMetadata(identity: MetadataIdentity): Promise<MetadataEntity> {
    const existing = this.cache.get(identity);
    this.cache.delete(identity);

    const providerResults = await this.executor.refresh(identity, 'ReadDatabase');
    const mergedDTO = this.mergePolicy.merge(providerResults);

    if (!mergedDTO) {
      throw new Error(`Cannot refresh metadata. No provider DTO resolved for identity ${identity.metadataId}`);
    }

    const entity = await this.pipeline.processDTO(identity.entityKind, mergedDTO, existing);
    if (!entity) {
      throw new Error(`Failed to process DTO during metadata refresh for ${identity.metadataId}`);
    }

    this.publishEntity(entity, 'MetadataRefreshed');

    return entity;
  }

  private publishEntity(
    entity: MetadataEntity,
    eventType: keyof Pick<MetadataEventMap, 'MetadataLoaded' | 'MetadataCreated' | 'MetadataRefreshed'>
  ): void {
    this.cache.set(entity);
    this.eventBus.emit(eventType, { identity: entity.identity, entity });
  }
}
