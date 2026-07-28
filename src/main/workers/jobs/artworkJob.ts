import { EventEmitter } from 'events';

import { getAlbumById } from '@main/db/queries/albums';
import { linkArtworksToAlbum } from '@main/db/queries/artworks';
import { db } from '@main/db/db';
import logger from '@main/logger';
import { storeArtworks } from '@main/other/artworks';
import { ASSET_EVENTS } from '../libraryChoreography';

import type { Job, JobPriority, JobState } from '../types';

export class ArtworkJob implements Job {
  id: string;
  type = 'artwork';
  state: JobState = 'queued';
  priority: JobPriority;
  retries = 0;
  description: string;

  public albumId: number;
  public sampleSongPath: string;
  private eventBus: EventEmitter;

  constructor(
    albumId: number,
    sampleSongPath: string,
    albumTitle: string,
    eventBus: EventEmitter,
    priority: JobPriority = 'normal'
  ) {
    this.albumId = albumId;
    this.sampleSongPath = sampleSongPath;
    this.eventBus = eventBus;
    this.id = `artwork_${albumId}`;
    this.priority = priority;
    this.description = `Generating artwork for "${albumTitle}"`;
  }

  async execute(): Promise<void> {
    try {
      // 1. Check idempotency: Does the album already have artwork?
      const album = await getAlbumById(this.albumId);
      if (!album) {
        logger.warn(`[ArtworkJob] Album ${this.albumId} not found, aborting.`);
        return;
      }

      // If it already has artworks, skip processing
      if (album.artworks && album.artworks.length > 0) {
        logger.debug(`[ArtworkJob] Album ${this.albumId} already has artwork.`);
        
        const optimizedArtwork = album.artworks.find((a) => a.artwork?.isOptimized)?.artwork || album.artworks[0].artwork;
        
        if (optimizedArtwork) {
          this.eventBus.emit(ASSET_EVENTS.ARTWORK_CREATED, {
            albumId: this.albumId,
            artworkId: optimizedArtwork.id,
            path: optimizedArtwork.path,
            albumTitle: album.title
          });
        }
        return;
      }

      // 2. Read ID3 tags
      const taglib = await import('node-taglib-sharp');
      const file = taglib.File.createFromPath(this.sampleSongPath);
      let pictureData: Uint8Array | undefined;
      
      try {
        const tag = file.tag;
        pictureData = tag?.pictures?.at(0)
          ? tag.pictures[0].data.toByteArray()
          : undefined;
      } finally {
        file.dispose();
      }

      // 3. Store artwork and link it in a transaction
      const artworkData = await db.transaction(async (trx) => {
        const data = await storeArtworks('album', pictureData, trx);

        // 4. Link artwork to album
        if (data && data.length > 0) {
          await linkArtworksToAlbum(
            data.map((artwork) => ({
              albumId: this.albumId,
              artworkId: artwork.id
            })),
            trx
          );
        }
        return data;
      });

      if (artworkData && artworkData.length > 0) {

        // Find the optimized artwork specifically intended for palette generation
        const optimizedArtwork = artworkData.find((a) => a.isOptimized) || artworkData[0];
        
        // 5. Emit business event with a structured payload
        this.eventBus.emit(ASSET_EVENTS.ARTWORK_CREATED, {
          albumId: this.albumId,
          artworkId: optimizedArtwork.id,
          path: optimizedArtwork.path,
          albumTitle: album.title
        });
      }
    } catch (error) {
      logger.error(`[ArtworkJob] Failed to generate artwork for album ${this.albumId}`, { error });
      throw error;
    }
  }
}
