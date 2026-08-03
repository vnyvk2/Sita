import type { MetadataCapability } from '../common/types';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';

import { MetadataProviderInfo } from '../models/MetadataProviderInfo';

export class MetadataProviderRegistry {
  private readonly providers: Map<string, IMetadataProvider> = new Map();

  public register(provider: IMetadataProvider): void {
    this.providers.set(provider.info.id, provider);
  }

  public get(id: string): IMetadataProvider | undefined {
    return this.providers.get(id);
  }

  public getAll(): IMetadataProvider[] {
    return Array.from(this.providers.values());
  }

  public unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  public getProvidersForCapability(
    capability: MetadataCapability
  ): IMetadataProvider[] {
    return Array.from(this.providers.values())
      .filter((p) => p.info.enabled && p.info.supports(capability))
      .sort((a, b) => b.info.priority - a.info.priority);
  }

  public getAllInfo(): MetadataProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.info);
  }

  public clear(): void {
    this.providers.clear();
  }
}
