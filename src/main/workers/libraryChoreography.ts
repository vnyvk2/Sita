import { libraryScheduler } from './jobScheduler';
import { PaletteJob } from './jobs/paletteJob';
import { GarbageCollectionJob } from './jobs/garbageCollectionJob';
import log from '@main/logger';

export const ASSET_EVENTS = {
  ARTWORK_CREATED: 'ASSET_CREATED:ARTWORK',
  WAVEFORM_CREATED: 'ASSET_CREATED:WAVEFORM',
} as const;

const handleArtworkCreated = (payload: { artworkId: number; path: string; albumId: number; albumTitle: string }) => {
  libraryScheduler.enqueue(new PaletteJob(payload.artworkId, payload.path, payload.albumTitle));
  libraryScheduler.requestMaintenance();
};

const handleMaintenanceReady = () => {
  log.info('[LibraryChoreography] Maintenance Ready - Enqueuing Garbage Collection');
  libraryScheduler.enqueue(new GarbageCollectionJob());
};

export function registerLibraryChoreography() {
  log.info('[LibraryChoreography] Registering asset pipeline choreographies');
  libraryScheduler.on(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
  libraryScheduler.on('MAINTENANCE_READY', handleMaintenanceReady);
}

export function disposeLibraryChoreography() {
  log.info('[LibraryChoreography] Disposing asset pipeline choreographies');
  libraryScheduler.off(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
  libraryScheduler.off('MAINTENANCE_READY', handleMaintenanceReady);
}
