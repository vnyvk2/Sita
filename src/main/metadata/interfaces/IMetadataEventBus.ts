import type { MetadataEventMap } from '../events/MetadataEvents';

export interface IMetadataEventBus {
  emit<K extends keyof MetadataEventMap>(
    event: K,
    ...args: Parameters<MetadataEventMap[K]>
  ): boolean;
  on<K extends keyof MetadataEventMap>(event: K, listener: MetadataEventMap[K]): this;
  off<K extends keyof MetadataEventMap>(event: K, listener: MetadataEventMap[K]): this;
}
