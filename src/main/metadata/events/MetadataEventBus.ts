import { EventEmitter } from 'events';

import type { IMetadataEventBus } from '../interfaces/IMetadataEventBus';
import type { MetadataEventMap } from './MetadataEvents';

export class MetadataEventBus implements IMetadataEventBus {
  private readonly emitter = new EventEmitter();

  public emit<K extends keyof MetadataEventMap>(
    event: K,
    ...args: Parameters<MetadataEventMap[K]>
  ): boolean {
    return this.emitter.emit(event, ...args);
  }

  public on<K extends keyof MetadataEventMap>(event: K, listener: MetadataEventMap[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  public off<K extends keyof MetadataEventMap>(event: K, listener: MetadataEventMap[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  public removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
