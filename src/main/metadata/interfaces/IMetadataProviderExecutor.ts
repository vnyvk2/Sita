import type { MetadataCapability } from '../common/types';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';

export interface IMetadataProviderExecutor {
  execute<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]>;
  executeMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]>;
  refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]>;
  refreshMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]>;
}
