import { EventEmitter } from 'events';

import type { CollectionEvent } from '../../../common/collections/operationInputs';

export type { CollectionEvent };

export class CollectionEventBus extends EventEmitter {
  /**
   * Global mute flag used during batch operations (e.g., multi-playlist import)
   * to suppress intermediate per-item collection events and prevent TanStack Query
   * event storms in the renderer.
   *
   * Note: Concurrent manual playlist actions during a muted batch will have their
   * UI updates deferred until unmute(true) emits the final consolidated event.
   */
  private isMuted = false;

  public mute(): void {
    this.isMuted = true;
  }

  public unmute(emitConsolidated = true): void {
    this.isMuted = false;
    if (emitConsolidated) {
      this.emitEvent({
        type: 'CollectionChanged',
        payload: { action: 'bulkImport' }
      });
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public emitEvent(event: CollectionEvent): boolean {
    if (this.isMuted) {
      return false;
    }
    return this.emit('event', event);
  }

  public onEvent(listener: (event: CollectionEvent) => void): this {
    return this.on('event', listener);
  }

  public offEvent(listener: (event: CollectionEvent) => void): this {
    return this.off('event', listener);
  }
}

export const collectionEventBus = new CollectionEventBus();

