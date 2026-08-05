import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderResult } from '../models/ProviderResult';
import type { ProviderCapabilities, ProviderCapability } from './ProviderCapabilities';
import type { ProviderConfiguration } from './ProviderConfiguration';
import type { ProviderIdentity } from './ProviderIdentity';

export interface IProviderLifecycle {
  initialize?(config?: ProviderConfiguration): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface IMetadataProviderAdapter {
  readonly identity: ProviderIdentity;
  readonly capabilities: ProviderCapabilities;

  supports(capability: ProviderCapability): boolean;

  lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>>;
  search<TDTO = unknown>(query: string, options?: Record<string, unknown>): Promise<ProviderResult<TDTO>[]>;
}
