import type { MetadataCapability } from '../common/types';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';

export interface IMetadataProvider {
  readonly info: MetadataProviderInfo;
  initialize(): Promise<void>;
  supports(capability: MetadataCapability): boolean;
  fetch(identity: MetadataIdentity): Promise<MetadataEntity | null>;
  refresh(identity: MetadataIdentity): Promise<MetadataEntity | null>;
  shutdown(): Promise<void>;
  getCapabilities(): Set<MetadataCapability>;
}
