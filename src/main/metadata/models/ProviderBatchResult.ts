import type { MetadataProviderInfo } from './MetadataProviderInfo';
import type { ProviderResult } from './ProviderResult';

export interface ProviderBatchResultOptions<TDTO = unknown> {
  providerInfo: MetadataProviderInfo;
  results: ProviderResult<TDTO>[];
}

export class ProviderBatchResult<TDTO = unknown> {
  public readonly providerInfo: MetadataProviderInfo;
  public readonly results: ProviderResult<TDTO>[];

  constructor(options: ProviderBatchResultOptions<TDTO>) {
    this.providerInfo = options.providerInfo;
    this.results = options.results;
  }
}
