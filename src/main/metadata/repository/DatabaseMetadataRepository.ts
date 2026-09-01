import { MetadataRepositoryError } from '../common/errors';
import type { IMetadataRepository } from '../interfaces/IMetadataRepository';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import { MetadataIdentity as ConcreteIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';
import { LoaderRegistry } from './LoaderRegistry';
import type { IEntityLoader } from './strategies/IEntityLoader';

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
    throw new MetadataRepositoryError(
      'DatabaseMetadataRepository.find is not supported; use findDTO or loadRawData'
    );
  }

  public async findDTO<T = unknown>(identity: MetadataIdentity): Promise<T | null> {
    return this.loadRawData<T>(identity);
  }

  public async findManyDTO<T = unknown>(
    kind: MetadataKind,
    ids: (string | number)[]
  ): Promise<T[]> {
    const identities = ids.map((id) => new ConcreteIdentity({ entityKind: kind, entityId: id }));
    const results = await this.loadMany<T>(identities);
    return results.filter((item): item is T => item !== null);
  }

  public async loadRawData<T = unknown>(identity: MetadataIdentity): Promise<T | null> {
    const loader = this.loaderRegistry.get<T>(identity.entityKind);
    if (!loader) {
      throw new MetadataRepositoryError(`No loader registered for kind: ${identity.entityKind}`);
    }
    return (await loader.load(identity.entityId)) as T | null;
  }

  public async loadMany<T = unknown>(identities: MetadataIdentity[]): Promise<(T | null)[]> {
    if (identities.length === 0) return [];

    // Group identities by entityKind
    const groups = new Map<string, (string | number)[]>();
    for (const id of identities) {
      const list = groups.get(id.entityKind) ?? [];
      list.push(id.entityId);
      groups.set(id.entityKind, list);
    }

    // Map storing loaded DTOs keyed by metadataId ("kind:id")
    const loadedMap = new Map<string, T>();

    for (const [kind, ids] of groups.entries()) {
      const loader = this.loaderRegistry.get<T>(kind as MetadataKind);
      if (!loader) continue;

      const loadedDTOs = await loader.loadMany(ids);
      for (const dto of loadedDTOs) {
        if (dto && typeof dto === 'object' && 'id' in dto) {
          const key = `${kind}:${(dto as Record<string, unknown>).id}`;
          loadedMap.set(key, dto);
        }
      }
    }

    // Map back in exact original order requested by identities
    return identities.map((identity) => loadedMap.get(identity.metadataId) ?? null);
  }

  public async store(_entity: MetadataEntity): Promise<void> {
    throw new MetadataRepositoryError(
      'DatabaseMetadataRepository is read-only for metadata pipeline'
    );
  }

  public async update(_entity: MetadataEntity): Promise<void> {
    throw new MetadataRepositoryError(
      'DatabaseMetadataRepository is read-only for metadata pipeline'
    );
  }

  public async remove(_identity: MetadataIdentity): Promise<boolean> {
    throw new MetadataRepositoryError(
      'DatabaseMetadataRepository is read-only for metadata pipeline'
    );
  }

  public async search(_query: unknown): Promise<MetadataEntity[]> {
    return [];
  }
}
