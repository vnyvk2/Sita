import type { CollectionId } from '../../common/collections/types';
import type { CollectionProvider } from './providers/types';
import type { CollectionRegistry } from './registry';

export class CollectionResolver {
  private readonly registry: CollectionRegistry;

  constructor(registry: CollectionRegistry) {
    this.registry = registry;
  }

  public resolveProvider(id: CollectionId): CollectionProvider {
    const descriptor = this.registry.get(id.type);
    
    if (!descriptor) {
      throw new Error(`No provider registered for collection type: '${id.type}'`);
    }

    return descriptor.provider;
  }
}
