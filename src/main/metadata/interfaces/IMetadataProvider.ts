import type { MetadataCapability } from '../common/types';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';

export interface IMetadataProvider {
  readonly info: MetadataProviderInfo;
  initialize(): Promise<void>;
  supports(capability: MetadataCapability): boolean;
  fetch<TDTO = unknown>(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>>;
  refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>>;
  shutdown(): Promise<void>;
  getCapabilities(): Set<MetadataCapability>;
}
