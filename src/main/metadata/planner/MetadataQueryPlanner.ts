import type { DatabaseMetadataRepository } from '../repository/DatabaseMetadataRepository';
import type { MetadataQuery } from '../models/MetadataQuery';

export interface QueryPlanExecutionResult<TDTO = unknown> {
  kind: MetadataQuery['kind'];
  dtos: TDTO[];
}

export class MetadataQueryPlanner {
  private readonly repository: DatabaseMetadataRepository;

  constructor(repository: DatabaseMetadataRepository) {
    this.repository = repository;
  }

  public async executePlan<TDTO>(query: MetadataQuery): Promise<QueryPlanExecutionResult<TDTO>> {
    const loader = this.repository.getLoader<TDTO>(query.kind);
    if (!loader) {
      return { kind: query.kind, dtos: [] };
    }

    if (query.filter?.id !== undefined) {
      const singleId = query.filter.id as string | number;
      const dto = await loader.load(singleId);
      return { kind: query.kind, dtos: dto ? [dto] : [] };
    }

    if (Array.isArray(query.filter?.ids)) {
      const ids = query.filter.ids as (string | number)[];
      const dtos = await loader.loadMany(ids);
      return { kind: query.kind, dtos };
    }

    return { kind: query.kind, dtos: [] };
  }
}
