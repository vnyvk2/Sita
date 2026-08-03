import type { MetadataIdentity } from './MetadataIdentity';
import type { MetadataProviderInfo } from './MetadataProviderInfo';
import type { ProviderResult } from './ProviderResult';

export interface ProviderBatchResultOptions<TDTO = unknown> {
  providerInfo: MetadataProviderInfo;
  resultsByIdentity: Map<string, ProviderResult<TDTO>>;
}

export class ProviderBatchResult<TDTO = unknown> {
  public readonly providerInfo: MetadataProviderInfo;
  private readonly _resultsByIdentity: Map<string, ProviderResult<TDTO>>;

  constructor(options: ProviderBatchResultOptions<TDTO>) {
    this.providerInfo = options.providerInfo;
    this._resultsByIdentity = options.resultsByIdentity;
  }

  public getResult(identity: MetadataIdentity): ProviderResult<TDTO> | undefined {
    return this._resultsByIdentity.get(identity.metadataId);
  }

  public has(identity: MetadataIdentity): boolean {
    return this._resultsByIdentity.has(identity.metadataId);
  }

  public getAllResults(): ProviderResult<TDTO>[] {
    return Array.from(this._resultsByIdentity.values());
  }

  public get results(): ProviderResult<TDTO>[] {
    return this.getAllResults();
  }
}
