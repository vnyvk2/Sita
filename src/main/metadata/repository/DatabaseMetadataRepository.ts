import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';
import type { IEntityLoader } from './strategies/IEntityLoader';

import { MetadataRepositoryError } from '../common/errors';
import { IMetadataRepository } from '../interfaces/IMetadataRepository';
import { MetadataIdentity as ConcreteIdentity } from '../models/MetadataIdentity';
import { LoaderRegistry } from './LoaderRegistry';

export class DatabaseMetadataRepository implements IMetadataRepository {
  private readonly loaderRegistry: LoaderRegistry;

  constructor(loaderRegistryOrLoaders?: LoaderRegistry | IEntityLoader<unknown>[]) {
    if (Array.isArray(loaderRegistryOrLoaders)) {
      this.loaderRegistry = new LoaderRegistry(loaderRegistryOrLoaders);
    } else {
      this.loaderRegistry = loaderRegistryOrLoaders ?? new LoaderRegistry();
    }
  }

  public getLoader<T>(kind: string): IEntityLoader<T> | undefined {
    return this.loaderRegistry.get<T>(kind as MetadataKind);
  }

  public async find(_identity: MetadataIdentity): Promise<MetadataEntity | null> {
    throw new MetadataRepositoryError('DatabaseMetadataRepository.find is not supported; use findDTO or loadRawData');
  }

  public async findDTO<T = unknown>(identity: MetadataIdentity): Promise<T | null> {
    return this.loadRawData<T>(identity);
  }

  public async findManyDTO<T = unknown>(kind: MetadataKind, ids: (string | number)[]): Promise<T[]> {
    const identities = ids.map((id) => new ConcreteIdentity({ entityKind: kind, entityId: id }));
    return this.loadMany<T>(identities);
  }

  public async loadRawData<T = unknown>(identity: MetadataIdentity): Promise<T | null> {
    const loader = this.loaderRegistry.get<T>(identity.entityKind);
    if (!loader) {
      throw new MetadataRepositoryError(`No loader registered for kind: ${identity.entityKind}`);
    }
    return (await loader.load(identity.entityId)) as T | null;
  }

  public async loadMany<T = unknown>(identities: MetadataIdentity[]): Promise<T[]> {
    if (identities.length === 0) return [];

    // Group identities by entityKind
    const groups = new Map<string, MetadataIdentity[]>();
    for (const id of identities) {
      const list = groups.get(id.entityKind) ?? [];
      list.push(id);
      groups.set(id.entityKind, list);
    }

    const results: T[] = [];

    for (const [kind, groupIdentities] of groups.entries()) {
      const loader = this.loaderRegistry.get<T>(kind as MetadataKind);
      if (!loader) continue;

      const entityIds = groupIdentities.map((i) => i.entityId);
      const loadedDTOs = await loader.loadMany(entityIds);
      results.push(...loadedDTOs);
    }

    return results;
  }

  public async store(_entity: MetadataEntity): Promise<void> {
    throw new MetadataRepositoryError('DatabaseMetadataRepository is read-only for metadata pipeline');
  }

  public async update(_entity: MetadataEntity): Promise<void> {
    throw new MetadataRepositoryError('DatabaseMetadataRepository is read-only for metadata pipeline');
  }

  public async remove(_identity: MetadataIdentity): Promise<boolean> {
    throw new MetadataRepositoryError('DatabaseMetadataRepository is read-only for metadata pipeline');
  }

  public async search(_query: unknown): Promise<MetadataEntity[]> {
    return [];
  }
}
