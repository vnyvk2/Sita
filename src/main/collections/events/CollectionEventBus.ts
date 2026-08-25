import { EventEmitter } from 'events';

import type { CollectionEvent } from '../../../common/collections/operationInputs';

export type { CollectionEvent };

export class CollectionEventBus extends EventEmitter {
  public emitEvent(event: CollectionEvent): boolean {
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
