import { EventEmitter } from 'events';

import { getAlbumById } from '@main/db/queries/albums';
import {
  CURRENT_ARTWORK_GENERATOR_VERSION,
  linkArtworksToAlbum,
  saveArtworks
} from '@main/db/queries/artworks';
import { db } from '@main/db/db';
import logger from '@main/logger';
import { processArtworkFiles } from '@main/other/artworks';
import { extractFrontCover } from '@main/utils/extractFrontCover';

import { ASSET_EVENTS } from '../libraryChoreography';
import type { Job, JobClass, JobState } from '../types';

export { CURRENT_ARTWORK_GENERATOR_VERSION };

export class ArtworkJob implements Job {
  id: string;
  type = 'artwork';
  state: JobState = 'queued';
  jobClass: JobClass;
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
    jobClass: JobClass = 'interactive'
  ) {
    this.albumId = albumId;
    this.sampleSongPath = sampleSongPath;
    this.eventBus = eventBus;
    this.id = `artwork_${albumId}`;
    this.jobClass = jobClass;
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

      // If it already has artworks, skip processing if version is up to date
      if (album.artworks && album.artworks.length > 0) {
        const optimizedArtwork =
          album.artworks.find((a) => a.artwork?.isOptimized)?.artwork || album.artworks[0].artwork;

        if (
          optimizedArtwork &&
          CURRENT_ARTWORK_GENERATOR_VERSION <= optimizedArtwork.generatorVersion
        ) {
          logger.debug(`[ArtworkJob] Album ${this.albumId} already has artwork (up to date).`);
          this.eventBus.emit(ASSET_EVENTS.ARTWORK_CREATED, {
            albumId: this.albumId,
            artworkId: optimizedArtwork.id,
            path: optimizedArtwork.path,
            albumTitle: album.title
          });
          return;
        }

        logger.debug(`[ArtworkJob] Album ${this.albumId} artwork is outdated. Regenerating.`);
      }

      if (this.state === 'cancelled') return;

      // 2. Read ID3 tags
      const taglib = await import('node-taglib-sharp');
      const file = taglib.File.createFromPath(this.sampleSongPath);
      let pictureData: Uint8Array | undefined;

      try {
        const tag = file.tag;
        pictureData = extractFrontCover(tag?.pictures);
      } finally {
        file.dispose();
      }

      if (this.state === 'cancelled') return;

      // 3. Store artwork (process outside transaction)
      const processedArtwork = await processArtworkFiles('album', pictureData);

      if (this.state === 'cancelled') return;

      // 4. Save and link artwork in a transaction
      const artworkData = await db.transaction(async (trx) => {
        let data = processedArtwork.existing;

        if (!data && processedArtwork.payloads) {
          data = await saveArtworks(processedArtwork.payloads, trx);
        }

        // Link artwork to album
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

        // 5. Post-commit guarantee: event MUST fire after successful commit
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
