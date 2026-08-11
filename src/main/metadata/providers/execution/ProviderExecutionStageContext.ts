import type { MetadataEventBus } from '../../events/MetadataEventBus';
import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../../models/ProviderExecutionContext';
import type { ProviderResult } from '../../models/ProviderResult';

import { MetadataProviderConfig } from '../config/MetadataProviderConfig';

export interface ProviderExecutionStageContextOptions<TDTO = unknown> {
  provider: IMetadataProvider;
  identity: MetadataIdentity;
  execContext?: ProviderExecutionContext;
  config?: MetadataProviderConfig;
  eventBus: MetadataEventBus;
  action: (
    provider: IMetadataProvider,
    identity: MetadataIdentity,
    context?: ProviderExecutionContext
  ) => Promise<ProviderResult<TDTO>>;
}

export class ProviderExecutionStageContext<TDTO = unknown> {
  public readonly provider: IMetadataProvider;
  public readonly identity: MetadataIdentity;
  public readonly execContext?: ProviderExecutionContext;
  public readonly config: MetadataProviderConfig;
  public readonly eventBus: MetadataEventBus;
  public readonly action: (
    provider: IMetadataProvider,
    identity: MetadataIdentity,
    context?: ProviderExecutionContext
  ) => Promise<ProviderResult<TDTO>>;

  constructor(options: ProviderExecutionStageContextOptions<TDTO>) {
    this.provider = options.provider;
    this.identity = options.identity;
    this.execContext = options.execContext;
    this.config = options.config ?? new MetadataProviderConfig();
    this.eventBus = options.eventBus;
    this.action = options.action;
  }
}
