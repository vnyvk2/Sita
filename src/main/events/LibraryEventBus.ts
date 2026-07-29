import { EventEmitter } from 'events';

export type LibraryEvent =
  | 'SongMetadataChanged'
  | 'SongPlayCountChanged'
  | 'SongFavoriteChanged'
  | 'SongRatingChanged'
  | 'SongAdded'
  | 'SongRemoved';

export interface SongMetadataChangedEvent {
  songId: number;
  changedFields: string[]; // e.g. ['title', 'artist']
}

export interface SongEvent {
  songId: number;
}

export interface LibraryEventMap {
  SongMetadataChanged: (event: SongMetadataChangedEvent) => void;
  SongPlayCountChanged: (event: SongEvent) => void;
  SongFavoriteChanged: (event: SongEvent) => void;
  SongRatingChanged: (event: SongEvent) => void;
  SongAdded: (event: SongEvent) => void;
  SongRemoved: (event: SongEvent) => void;
}

export class LibraryEventBus extends EventEmitter {
  public emitEvent<K extends keyof LibraryEventMap>(
    eventName: K,
    ...args: Parameters<LibraryEventMap[K]>
  ): boolean {
    return this.emit(eventName, ...args);
  }

  public onEvent<K extends keyof LibraryEventMap>(
    eventName: K,
    listener: LibraryEventMap[K]
  ): this {
    return this.on(eventName, listener);
  }

  public offEvent<K extends keyof LibraryEventMap>(
    eventName: K,
    listener: LibraryEventMap[K]
  ): this {
    return this.off(eventName, listener);
  }
}

// Global singleton
export const libraryEventBus = new LibraryEventBus();
