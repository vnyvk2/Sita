import type { MetadataCapability } from '../../common/types';
import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';

export interface IProviderSelectionStrategy {
  selectProviders(
    providers: IMetadataProvider[],
    capability: MetadataCapability
  ): IMetadataProvider[];
}
