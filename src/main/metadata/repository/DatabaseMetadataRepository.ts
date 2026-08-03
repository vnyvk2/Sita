import type { IMetadataRepository } from '../interfaces/IMetadataRepository';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';
import type { MetadataQuery } from '../models/MetadataQuery';
import type { IEntityLoader } from './strategies/IEntityLoader';

import { LoaderRegistry } from './LoaderRegistry';

export class DatabaseMetadataRepository implements IMetadataRepository {
  private readonly loaderRegistry: LoaderRegistry;

  constructor(loaderRegistryOrCustomLoaders?: LoaderRegistry | IEntityLoader<unknown>[]) {
    if (loaderRegistryOrCustomLoaders instanceof LoaderRegistry) {
      this.loaderRegistry = loaderRegistryOrCustomLoaders;
    } else if (Array.isArray(loaderRegistryOrCustomLoaders)) {
      this.loaderRegistry = new LoaderRegistry(loaderRegistryOrCustomLoaders);
    } else {
      this.loaderRegistry = new LoaderRegistry();
    }
  }

  public getLoader<T>(kind: MetadataKind): IEntityLoader<T> | undefined {
    return this.loaderRegistry.get<T>(kind);
  }

  public async findDTO<T>(identity: MetadataIdentity): Promise<T | null> {
    const loader = this.getLoader<T>(identity.entityKind);
    if (!loader) return null;
    return loader.load(identity.entityId);
  }

  public async findManyDTO<T>(kind: MetadataKind, ids: (string | number)[]): Promise<T[]> {
    const loader = this.getLoader<T>(kind);
    if (!loader) return [];
    return loader.loadMany(ids);
  }

  public async find(_identity: MetadataIdentity): Promise<MetadataEntity | null> {
    throw new Error(
      `DatabaseMetadataRepository.find() returns persistence DTOs. Use findDTO() or MetadataEngine for domain entities.`
    );
  }

  public async store(_entity: MetadataEntity): Promise<void> {
    throw new Error('DatabaseMetadataRepository is read-only in Phase 2. Write support is added in Phase 6.');
  }

  public async update(_entity: MetadataEntity): Promise<void> {
    throw new Error('DatabaseMetadataRepository is read-only in Phase 2. Write support is added in Phase 6.');
  }

  public async remove(_identity: MetadataIdentity): Promise<boolean> {
    throw new Error('DatabaseMetadataRepository is read-only in Phase 2. Write support is added in Phase 6.');
  }

  public async search(_query: MetadataQuery): Promise<MetadataEntity[]> {
    throw new Error('Use MetadataQueryPlanner and MetadataEngine.query() for query execution.');
  }
}
