import { EventEmitter } from 'events';
import path from 'path';
import { inArray } from 'drizzle-orm';

import { db } from '@main/db/db';
import { getAlbumById } from '@main/db/queries/albums';
import { linkArtworksToAlbum, saveArtworks } from '@main/db/queries/artworks';
import { artworks } from '@main/db/schema';
import { DEFAULT_ARTWORK_SAVE_LOCATION } from '@main/filesystem';
import logger from '@main/logger';
import type { ArtworkPayload } from '@main/other/artworks';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../libraryChoreography';

import type { Job, JobClass, JobState } from '../types';

export const CURRENT_ARTWORK_GENERATOR_VERSION = 1;

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
      // 1. Check idempotency: Does the album already have artwork in DB?
      const album = await getAlbumById(this.albumId);
      if (!album) {
        logger.warn(`[ArtworkJob] Album ${this.albumId} not found, aborting.`);
        return;
      }

      // If it already has artworks, skip processing if version is up to date
      if (album.artworks && album.artworks.length > 0) {
        const optimizedArtwork = album.artworks.find((a) => a.artwork?.isOptimized)?.artwork || album.artworks[0].artwork;
        
        if (optimizedArtwork && CURRENT_ARTWORK_GENERATOR_VERSION <= optimizedArtwork.generatorVersion) {
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

      // 2. Delegate CPU ID3 Taglib extraction & Sharp WebP resizing to utilityProcess worker
      const targetPath = path.join(DEFAULT_ARTWORK_SAVE_LOCATION, 'sample.webp');
      const result = await mediaWorkerBridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: this.sampleSongPath,
        destinationPath: targetPath,
        metadata: {
          albumId: this.albumId,
          version: CURRENT_ARTWORK_GENERATOR_VERSION
        }
      });

      if (!result.success) {
        throw new Error(result.error || `Failed to generate artwork for album ${this.albumId}`);
      }

      if (this.state === 'cancelled') return;

      // 3. Save and link artwork in a DB transaction (Main owns all DB state)
      if (result.metadata.hasEmbeddedArtwork && result.metadata.payloads) {
        const fullHash = result.metadata.fullHash as string;
        const optHash = result.metadata.optHash as string;

        const artworkData = await db.transaction(async (trx) => {
          // Check if existing artwork with hash exists
          const existingArtworks = await trx.select().from(artworks).where(
            inArray(artworks.hash, [fullHash, optHash])
          );

          let data = existingArtworks.length > 0 ? existingArtworks : undefined;
          if (!data && result.metadata.payloads) {
            data = await saveArtworks(result.metadata.payloads as ArtworkPayload[], trx);
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
          const optimizedArtwork = artworkData.find((a) => a.isOptimized) || artworkData[0];
          
          // 4. Post-commit guarantee: event MUST fire after successful commit
          this.eventBus.emit(ASSET_EVENTS.ARTWORK_CREATED, {
            albumId: this.albumId,
            artworkId: optimizedArtwork.id,
            path: optimizedArtwork.path,
            albumTitle: album.title
          });
        }
      }
    } catch (error) {
      logger.error(`[ArtworkJob] Failed to generate artwork for album ${this.albumId}`, { error });
      throw error;
    }
  }
}
