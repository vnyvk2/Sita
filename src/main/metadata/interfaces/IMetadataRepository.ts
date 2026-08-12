import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataQuery } from '../models/MetadataQuery';

export interface IMetadataRepository {
  find(identity: MetadataIdentity): Promise<MetadataEntity | null>;
  loadMany<T = unknown>(identities: MetadataIdentity[]): Promise<(T | null)[]>;
  store(entity: MetadataEntity): Promise<void>;
  update(entity: MetadataEntity): Promise<void>;
  remove(identity: MetadataIdentity): Promise<boolean>;
  search(query: MetadataQuery): Promise<MetadataEntity[]>;
}
