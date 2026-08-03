import type { MetadataCache } from '../cache/MetadataCache';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataEngine } from '../interfaces/IMetadataEngine';
import type { MetadataContext } from '../models/MetadataContext';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataQuery } from '../models/MetadataQuery';
import type { MetadataPipeline } from '../pipeline/MetadataPipeline';
import type { MetadataQueryPlanner } from '../planner/MetadataQueryPlanner';
import type { DatabaseMetadataRepository } from '../repository/DatabaseMetadataRepository';

export interface MetadataEngineOptions {
  repository: DatabaseMetadataRepository;
  planner: MetadataQueryPlanner;
  pipeline: MetadataPipeline;
  cache: MetadataCache;
  eventBus: MetadataEventBus;
  context: MetadataContext;
}

export class MetadataEngine implements IMetadataEngine {
  private readonly repository: DatabaseMetadataRepository;
  private readonly planner: MetadataQueryPlanner;
  private readonly pipeline: MetadataPipeline;
  private readonly cache: MetadataCache;
  private readonly eventBus: MetadataEventBus;
  private readonly context: MetadataContext;

  constructor(options: MetadataEngineOptions) {
    this.repository = options.repository;
    this.planner = options.planner;
    this.pipeline = options.pipeline;
    this.cache = options.cache;
    this.eventBus = options.eventBus;
    this.context = options.context;
  }

  public async getEntityMetadata(identity: MetadataIdentity): Promise<MetadataEntity | null> {
    const cached = this.cache.get(identity);
    if (cached) {
      this.context.logger.debug(`Cache hit for metadata: ${identity.metadataId}`);
      return cached;
    }

    const dto = await this.repository.findDTO(identity);
    if (!dto) {
      this.context.logger.debug(`No DTO found for identity: ${identity.metadataId}`);
      return null;
    }

    const entity = await this.pipeline.processDTO(identity.entityKind, dto, null);
    if (entity) {
      this.cache.set(entity);
      this.eventBus.emit('MetadataCreated', { identity: entity.identity, entity });
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
          this.cache.set(entity);
          this.eventBus.emit('MetadataCreated', { identity: entity.identity, entity });
        }
        return entity;
      })
    );

    return entities.filter((entity): entity is MetadataEntity => entity !== null);
  }

  public async refreshMetadata(identity: MetadataIdentity): Promise<MetadataEntity> {
    const existing = this.cache.get(identity);
    this.cache.delete(identity);

    const dto = await this.repository.findDTO(identity);
    if (!dto) {
      throw new Error(`Cannot refresh metadata. DTO not found for identity ${identity.metadataId}`);
    }

    const entity = await this.pipeline.processDTO(identity.entityKind, dto, existing);
    if (!entity) {
      throw new Error(`Failed to process DTO during metadata refresh for ${identity.metadataId}`);
    }

    this.cache.set(entity);
    this.eventBus.emit('MetadataRefreshed', { identity: entity.identity, entity });

    return entity;
  }
}
