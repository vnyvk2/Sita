import type { MetadataCache } from '../cache/MetadataCache';
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
  context: MetadataContext;
}

export class MetadataEngine implements IMetadataEngine {
  private readonly repository: DatabaseMetadataRepository;
  private readonly planner: MetadataQueryPlanner;
  private readonly pipeline: MetadataPipeline;
  private readonly cache: MetadataCache;
  private readonly context: MetadataContext;

  constructor(options: MetadataEngineOptions) {
    this.repository = options.repository;
    this.planner = options.planner;
    this.pipeline = options.pipeline;
    this.cache = options.cache;
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

    return this.pipeline.processDTO(identity.entityKind, dto);
  }

  public async getEntitiesMetadata(identities: MetadataIdentity[]): Promise<MetadataEntity[]> {
    const results: MetadataEntity[] = [];
    for (const identity of identities) {
      const entity = await this.getEntityMetadata(identity);
      if (entity) {
        results.push(entity);
      }
    }
    return results;
  }

  public async query(query: MetadataQuery): Promise<MetadataEntity[]> {
    const planResult = await this.planner.executePlan(query);
    const entities: MetadataEntity[] = [];

    for (const dto of planResult.dtos) {
      const entity = this.pipeline.processDTO(query.kind, dto);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }

  public async refreshMetadata(identity: MetadataIdentity): Promise<MetadataEntity> {
    this.cache.delete(identity);
    const dto = await this.repository.findDTO(identity);
    if (!dto) {
      throw new Error(`Cannot refresh metadata. DTO not found for identity ${identity.metadataId}`);
    }

    const entity = this.pipeline.processDTO(identity.entityKind, dto);
    if (!entity) {
      throw new Error(`Failed to process DTO during metadata refresh for ${identity.metadataId}`);
    }

    return entity;
  }
}
