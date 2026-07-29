import type { CollectionType, CollectionCapabilities } from '../../common/collections/types';
import type { CollectionProvider } from './providers/types';

export type ProviderCost = 'cheap' | 'medium' | 'expensive';

export interface CollectionDescriptor {
  type: CollectionType;
  displayName: string;
  icon: string;
  capabilities: CollectionCapabilities;
  provider: CollectionProvider;
  cost: ProviderCost;
  route: string;
}

export class CollectionRegistry {
  private descriptors = new Map<CollectionType, CollectionDescriptor>();

  public register(descriptor: CollectionDescriptor): void {
    if (this.descriptors.has(descriptor.type)) {
      throw new Error(`Collection descriptor for type '${descriptor.type}' is already registered.`);
    }
    this.descriptors.set(descriptor.type, descriptor);
  }

  public unregister(type: CollectionType): void {
    this.descriptors.delete(type);
  }

  public get(type: CollectionType): CollectionDescriptor | undefined {
    return this.descriptors.get(type);
  }

  public list(): CollectionDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  public has(type: CollectionType): boolean {
    return this.descriptors.has(type);
  }
}
