import { EventEmitter } from 'events';

export type CollectionEvent =
  | { type: 'CollectionChanged'; payload: { collectionId?: number; action?: string; [key: string]: any } }
  | { type: 'CollectionDeleted'; payload: { collectionIds: number[] } }
  | { type: 'CollectionMoved'; payload: { collectionId: number; newParentId: number | null } }
  | { type: 'CollectionPinned'; payload: { collectionId: number; isPinned: boolean } }
  | { type: 'SmartPlaylistUpdated'; payload: { collectionId: number } }
  | { type: 'CollectionCreated'; payload: { collectionId: number; parentId: number | null } };

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
