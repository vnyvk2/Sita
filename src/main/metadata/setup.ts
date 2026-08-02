import { metadataFieldRegistry } from './registries/MetadataFieldRegistry';
import { metadataProviderRegistry } from './registries/MetadataProviderRegistry';

export class MetadataBootstrap {
  private static isInitialized = false;

  public static initialize(): void {
    if (MetadataBootstrap.isInitialized) {
      return;
    }

    // Initialize field registry defaults
    metadataFieldRegistry.getAll();

    // Reset/clear provider registry for clean container boot
    metadataProviderRegistry.getAllInfo();

    MetadataBootstrap.isInitialized = true;
  }

  public static reset(): void {
    metadataFieldRegistry.clear();
    metadataProviderRegistry.clear();
    MetadataBootstrap.isInitialized = false;
  }
}
