import { libraryScheduler } from './jobScheduler';
import { PaletteJob } from './jobs/paletteJob';
import { GarbageCollectionJob } from './jobs/garbageCollectionJob';
import { AlbumReplayGainJob } from './jobs/albumReplayGainJob';
import log from '@main/logger';

export const ASSET_EVENTS = {
  ARTWORK_CREATED: 'ASSET_CREATED:ARTWORK',
  WAVEFORM_CREATED: 'ASSET_CREATED:WAVEFORM',
  REPLAYGAIN_CREATED: 'ASSET_CREATED:REPLAYGAIN',
  ALBUM_REPLAYGAIN_UPDATED: 'ASSET_CREATED:ALBUM_REPLAYGAIN',
  LYRICS_CREATED: 'ASSET_CREATED:LYRICS'
} as const;

const handleArtworkCreated = (payload: { artworkId: number; path: string; albumId: number; albumTitle: string }) => {
  libraryScheduler.enqueue(new PaletteJob(payload.artworkId, payload.path, payload.albumTitle));
  libraryScheduler.requestMaintenance();
};

const handleReplayGainCreated = (payload: { songId: number; albumId?: number; trackGain: number; trackPeak: number }) => {
  if (payload.albumId !== undefined && payload.albumId !== null) {
    libraryScheduler.enqueue(new AlbumReplayGainJob(payload.albumId, libraryScheduler));
  }
};

let isRecoverySweeping = false;

const handleMaintenanceReady = async () => {
  log.info('[LibraryChoreography] Maintenance Ready - Enqueuing Garbage Collection');
  libraryScheduler.enqueue(new GarbageCollectionJob());

  // Continuously sweep next batch of unindexed/missing library assets until library is fully hydrated
  if (!isRecoverySweeping) {
    isRecoverySweeping = true;
    try {
      const { recoverLibraryAssets } = await import('@main/core/recovery');
      const { remainingWork } = await recoverLibraryAssets();
      if (remainingWork) {
        // Request another maintenance cycle once this batch finishes processing
        libraryScheduler.requestMaintenance();
      }
    } catch (err) {
      log.warn('[LibraryChoreography] Error during maintenance recovery sweep:', { error: err });
    } finally {
      isRecoverySweeping = false;
    }
  }
};

export function registerLibraryChoreography() {
  log.info('[LibraryChoreography] Registering asset pipeline choreographies');
  libraryScheduler.on(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
  libraryScheduler.on(ASSET_EVENTS.REPLAYGAIN_CREATED, handleReplayGainCreated);
  libraryScheduler.on('MAINTENANCE_READY', handleMaintenanceReady);
}

export function disposeLibraryChoreography() {
  log.info('[LibraryChoreography] Disposing asset pipeline choreographies');
  libraryScheduler.off(ASSET_EVENTS.ARTWORK_CREATED, handleArtworkCreated);
  libraryScheduler.off(ASSET_EVENTS.REPLAYGAIN_CREATED, handleReplayGainCreated);
  libraryScheduler.off('MAINTENANCE_READY', handleMaintenanceReady);
}
