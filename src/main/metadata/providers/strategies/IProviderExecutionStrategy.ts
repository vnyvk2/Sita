import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderBatchResult } from '../../models/ProviderBatchResult';
import type { ProviderExecutionContext } from '../../models/ProviderExecutionContext';
import type { ProviderResult } from '../../models/ProviderResult';

export interface IProviderExecutionStrategy {
  execute<TDTO = unknown>(
    providers: IMetadataProvider[],
    identity: MetadataIdentity,
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identity: MetadataIdentity,
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>[]>;

  executeMany<TDTO = unknown>(
    providers: IMetadataProvider[],
    identities: MetadataIdentity[],
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identities: MetadataIdentity[],
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>[]>
  ): Promise<ProviderBatchResult<TDTO>[]>;
}
