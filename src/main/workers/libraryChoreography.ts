import { libraryScheduler } from './jobScheduler';
import { PaletteJob } from './jobs/paletteJob';
import log from '@main/logger';

export const ASSET_EVENTS = {
  ARTWORK_CREATED: 'ASSET_CREATED:ARTWORK',
} as const;

export function registerLibraryChoreography() {
  log.info('[LibraryChoreography] Registering asset pipeline choreographies');
  
  // Event Choreography: When an ArtworkJob finishes, queue a PaletteJob
  libraryScheduler.on(ASSET_EVENTS.ARTWORK_CREATED, (payload: { artworkId: number; path: string; albumId: number; albumTitle: string }) => {
    libraryScheduler.enqueue(new PaletteJob(payload.artworkId, payload.path, payload.albumTitle));
  });
}
