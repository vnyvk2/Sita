import type { IMetadataProviderAdapter } from '../contracts/IMetadataProviderAdapter';
import type { ProviderConfiguration } from '../contracts/ProviderConfiguration';
import { MetadataProviderRegistry } from './MetadataProviderRegistry';
import { MetadataProviderRuntime, type ProviderRuntimeOptions } from './MetadataProviderRuntime';

export type ProviderFactory = () => IMetadataProviderAdapter | Promise<IMetadataProviderAdapter>;

export class MetadataProviderDiscovery {
  private readonly registry: MetadataProviderRegistry;
  private readonly factories = new Map<string, ProviderFactory>();

  constructor(registry: MetadataProviderRegistry) {
    this.registry = registry;
  }

  public registerFactory(providerId: string, factory: ProviderFactory): void {
    this.factories.set(providerId, factory);
  }

  public async discoverAndLoad(
    providerId: string,
    config?: Partial<ProviderConfiguration>,
    options?: ProviderRuntimeOptions
  ): Promise<MetadataProviderRuntime> {
    const factory = this.factories.get(providerId);
    if (!factory) {
      throw new Error(`No provider factory registered for id: '${providerId}'`);
    }

    const adapter = await factory();
    const runtime = new MetadataProviderRuntime(adapter, config, options);
    await runtime.initialize();

    this.registry.register(runtime);
    return runtime;
  }

  public async discoverAll(
    configurations?: Record<string, Partial<ProviderConfiguration>>
  ): Promise<MetadataProviderRuntime[]> {
    const runtimes: MetadataProviderRuntime[] = [];

    for (const [providerId] of this.factories.entries()) {
      const config = configurations?.[providerId];
      try {
        const runtime = await this.discoverAndLoad(providerId, config);
        runtimes.push(runtime);
      } catch (err) {
        console.error(`[MetadataProviderDiscovery] Failed to load provider '${providerId}':`, err);
      }
    }

    return runtimes;
  }
}
