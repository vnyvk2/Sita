import { libraryScheduler } from './jobScheduler';
import { PaletteJob } from './jobs/paletteJob';
import log from '@main/logger';

export const ASSET_EVENTS = {
  ARTWORK_CREATED: 'ASSET_CREATED:ARTWORK',
} as const;

const handleArtworkCreated = (payload: { artworkId: number; path: string; albumId: number; albumTitle: string }) => {
  libraryScheduler.enqueue(new PaletteJob(payload.artworkId, payload.path, payload.albumTitle));
};

export function registerLibraryChoreography() {
  log.info('[LibraryChoreography] Registering asset pipeline choreographies');
  libraryScheduler.on(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
}

export function disposeLibraryChoreography() {
  log.info('[LibraryChoreography] Disposing asset pipeline choreographies');
  libraryScheduler.off(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
}
