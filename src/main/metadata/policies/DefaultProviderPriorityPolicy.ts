import type { MetadataProviderInfo } from '../models/MetadataProviderInfo';
import type { IProviderPriorityPolicy } from './ProviderPriorityPolicy';

export class DefaultProviderPriorityPolicy implements IProviderPriorityPolicy {
  public compare(providerA: MetadataProviderInfo, providerB: MetadataProviderInfo): number {
    return providerB.priority - providerA.priority;
  }
}
