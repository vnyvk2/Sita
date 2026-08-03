import type { MetadataEventBus } from '../../events/MetadataEventBus';
import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../../models/ProviderExecutionContext';
import type { MetadataProviderConfig } from '../config/MetadataProviderConfig';

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
  ) => Promise<unknown>;
}

export class ProviderExecutionStageContext<TDTO = unknown> {
  public readonly provider: IMetadataProvider;
  public readonly identity: MetadataIdentity;
  public readonly execContext?: ProviderExecutionContext;
  public readonly config?: MetadataProviderConfig;
  public readonly eventBus: MetadataEventBus;
  public readonly action: (
    provider: IMetadataProvider,
    identity: MetadataIdentity,
    context?: ProviderExecutionContext
  ) => Promise<unknown>;

  constructor(options: ProviderExecutionStageContextOptions<TDTO>) {
    this.provider = options.provider;
    this.identity = options.identity;
    this.execContext = options.execContext;
    this.config = options.config;
    this.eventBus = options.eventBus;
    this.action = options.action;
  }
}
