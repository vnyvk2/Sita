import { CORE_FIELD_DEFINITIONS } from './models/CoreFieldDefinitions';
import { MetadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { MetadataProviderRegistry } from './registries/MetadataProviderRegistry';

export interface MetadataModule {
  fieldRegistry: MetadataFieldRegistry;
  providerRegistry: MetadataProviderRegistry;
}

export class MetadataBootstrap {
  public static bootstrap(): MetadataModule {
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const providerRegistry = new MetadataProviderRegistry();

    return {
      fieldRegistry,
      providerRegistry
    };
  }
}
