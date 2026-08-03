import type { MetadataCapability } from '../common/types';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderBatchResult } from '../models/ProviderBatchResult';
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
  ): Promise<ProviderBatchResult<TDTO>[]>;
  refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]>;
  refreshMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderBatchResult<TDTO>[]>;
}
