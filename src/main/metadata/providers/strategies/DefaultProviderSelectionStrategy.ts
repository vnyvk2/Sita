import type { MetadataCapability } from '../../common/types';
import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';
import type { IProviderSelectionStrategy } from './IProviderSelectionStrategy';

import { ProviderStates } from '../../models/ProviderState';

export class DefaultProviderSelectionStrategy implements IProviderSelectionStrategy {
  public selectProviders(
    providers: IMetadataProvider[],
    capability: MetadataCapability
  ): IMetadataProvider[] {
    return providers
      .filter((p) => {
        const info = p.info;
        return (
          info.enabled &&
          info.state === ProviderStates.Ready &&
          p.supports(capability)
        );
      })
      .sort((a, b) => b.info.priority - a.info.priority);
  }
}
