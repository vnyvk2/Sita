import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';

export interface IProviderPriorityPolicy {
  compare(providerA: MetadataProviderInfo, providerB: MetadataProviderInfo): number;
}
