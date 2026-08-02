import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';

export interface IMetadataResolver<TRaw = unknown> {
  resolve(identity: MetadataIdentity, rawPayload: TRaw): MetadataEntity;
}
