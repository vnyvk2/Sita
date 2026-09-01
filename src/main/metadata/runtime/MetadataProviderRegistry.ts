import type { ProviderCapability } from '../contracts/ProviderCapabilities';
import type { MetadataProviderRuntime } from './MetadataProviderRuntime';

export class MetadataProviderRegistry {
  private readonly runtimes = new Map<string, MetadataProviderRuntime>();

  public register(runtime: MetadataProviderRuntime): void {
    const id = runtime.adapterInstance.identity.id;
    if (this.runtimes.has(id)) {
      throw new Error(`MetadataProviderRuntime already registered for provider id: '${id}'`);
    }
    this.runtimes.set(id, runtime);
  }

  public unregister(providerId: string): boolean {
    return this.runtimes.delete(providerId);
  }

  public get(providerId: string): MetadataProviderRuntime | undefined {
    return this.runtimes.get(providerId);
  }

  public has(providerId: string): boolean {
    return this.runtimes.has(providerId);
  }

  public getAll(): MetadataProviderRuntime[] {
    return Array.from(this.runtimes.values());
  }

  public getAvailable(): MetadataProviderRuntime[] {
    return this.getAll().filter((runtime) => runtime.isAvailable());
  }

  public getByCapability(capability: ProviderCapability): MetadataProviderRuntime[] {
    return this.getAvailable().filter((runtime) => runtime.adapterInstance.supports(capability));
  }

  public clear(): void {
    this.runtimes.clear();
  }
}
