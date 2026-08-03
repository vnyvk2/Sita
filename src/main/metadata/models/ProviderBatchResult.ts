import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataProviderInfo } from './MetadataProviderInfo';
import type { ProviderResult } from './ProviderResult';

export interface ProviderBatchResultOptions<TDTO = unknown> {
  providerInfo: MetadataProviderInfo;
  resultsByIdentity: Map<string, ProviderResult<TDTO>>;
}

export class ProviderBatchResult<TDTO = unknown> {
  public readonly providerInfo: MetadataProviderInfo;
  public readonly resultsByIdentity: Map<string, ProviderResult<TDTO>>;

  constructor(options: ProviderBatchResultOptions<TDTO>) {
    this.providerInfo = options.providerInfo;
    this.resultsByIdentity = options.resultsByIdentity;
  }

  public getResult(identity: MetadataIdentity): ProviderResult<TDTO> | undefined {
    return this.resultsByIdentity.get(identity.metadataId);
  }

  public get results(): ProviderResult<TDTO>[] {
    return Array.from(this.resultsByIdentity.values());
  }
}
