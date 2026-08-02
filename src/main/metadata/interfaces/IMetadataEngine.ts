import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataQuery } from '../models/MetadataQuery';

export interface IMetadataEngine {
  getEntityMetadata(identity: MetadataIdentity): Promise<MetadataEntity | null>;
  getEntitiesMetadata(identities: MetadataIdentity[]): Promise<MetadataEntity[]>;
  query(query: MetadataQuery): Promise<MetadataEntity[]>;
  refreshMetadata(identity: MetadataIdentity): Promise<MetadataEntity>;
}
