import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderResult } from '../../models/ProviderResult';
import type { UserMetadataProvider } from '../UserMetadataProvider';

export class UserMetadataAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'user-override-provider',
    name: 'User Override Provider',
    version: '1.0.0',
    providerType: 'user-override',
    description: 'Provides local user metadata overrides'
  };

  public readonly capabilities: ProviderCapabilities = new ProviderCapabilities([
    ProviderCapability.Lookup,
    ProviderCapability.Enrichment,
    ProviderCapability.Tags
  ]);

  private readonly userProvider: UserMetadataProvider;

  constructor(userProvider: UserMetadataProvider) {
    this.userProvider = userProvider;
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    return this.userProvider.fetch<TDTO>(identity);
  }

  public async search<TDTO = unknown>(_query: string): Promise<ProviderResult<TDTO>[]> {
    return [];
  }
}
