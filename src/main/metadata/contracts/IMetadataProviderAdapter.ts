import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import type { ProviderResult } from '../models/ProviderResult';
import type { ProviderCapabilities, ProviderCapability } from './ProviderCapabilities';
import type { ProviderConfiguration } from './ProviderConfiguration';
import type { ProviderIdentity } from './ProviderIdentity';
import type { ProviderStatus } from './ProviderStatus';

export interface IMetadataProviderAdapter {
  readonly identity: ProviderIdentity;
  readonly capabilities: ProviderCapabilities;
  readonly status: ProviderStatus;
  readonly legacyInfo: MetadataProviderInfo;

  initialize(config?: ProviderConfiguration): Promise<void>;
  shutdown(): Promise<void>;

  supports(capability: ProviderCapability): boolean;

  lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>>;
  search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]>;
}
