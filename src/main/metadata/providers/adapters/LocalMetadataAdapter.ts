import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import type { ProviderIdentity } from '../../contracts/ProviderIdentity';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { MetadataProviderInfo } from '../../models/MetadataProviderInfo';
import type { ProviderResult } from '../../models/ProviderResult';
import type { LocalMetadataProvider } from '../LocalMetadataProvider';

export class LocalMetadataAdapter implements IMetadataProviderAdapter {
  public readonly identity: ProviderIdentity = {
    id: 'local-file-provider',
    name: 'Local Database Provider',
    version: '1.0.0',
    providerType: 'embedded',
    description: 'Reads local audio file metadata from Nora database'
  };

  public readonly capabilities: ProviderCapabilities = new ProviderCapabilities([
    ProviderCapability.Lookup,
    ProviderCapability.Search,
    ProviderCapability.Artwork,
    ProviderCapability.Tags
  ]);

  private readonly localProvider: LocalMetadataProvider;

  constructor(localProvider: LocalMetadataProvider) {
    this.localProvider = localProvider;
  }

  public get legacyInfo(): MetadataProviderInfo {
    return this.localProvider.info;
  }

  public supports(capability: ProviderCapability): boolean {
    return this.capabilities.has(capability);
  }

  public async lookup<TDTO = unknown>(identity: MetadataIdentity): Promise<ProviderResult<TDTO>> {
    return this.localProvider.fetch<TDTO>(identity);
  }

  public async search<TDTO = unknown>(_query: string): Promise<ProviderResult<TDTO>[]> {
    return [];
  }
}
