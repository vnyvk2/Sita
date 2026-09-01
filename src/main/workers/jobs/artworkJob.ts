import { EventEmitter } from 'events';

import { db } from '@main/db/db';
import { getAlbumById } from '@main/db/queries/albums';
import {
  CURRENT_ARTWORK_GENERATOR_VERSION,
  linkArtworksToAlbum,
  saveArtworks
} from '@main/db/queries/artworks';
import { artworks } from '@main/db/schema';
import { DEFAULT_ARTWORK_SAVE_LOCATION } from '@main/filesystem';
import logger from '@main/logger';
import type { ArtworkPayload } from '@main/other/artworks';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { inArray } from 'drizzle-orm';

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
  private abortController = new AbortController();

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

  public cancel(): void {
    this.state = 'cancelled';
    this.abortController.abort();
  }

  public isCancelled(): boolean {
    return this.state === 'cancelled' || this.abortController.signal.aborted;
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

      if (this.isCancelled()) return;

      // 2. Delegate CPU ID3 Taglib extraction & Sharp WebP resizing to utilityProcess worker
      const result = await mediaWorkerBridge.generateAsset({
        jobType: 'artwork',
        sourceFilePath: this.sampleSongPath,
        destinationPath: DEFAULT_ARTWORK_SAVE_LOCATION,
        abortSignal: this.abortController.signal,
        metadata: {
          albumId: this.albumId,
          version: CURRENT_ARTWORK_GENERATOR_VERSION
        }
      });

      if (result.cancelled || this.isCancelled()) return;
      if (!result.success) {
        throw new Error(`[ArtworkJob] Failed to generate artwork for album ${this.albumId}`);
      }

      // 3. Save and link artwork in a DB transaction with complete hash-level deduplication
      if (result.metadata?.hasEmbeddedArtwork && result.metadata?.payloads) {
        const fullHash = result.metadata.fullHash as string;
        const optHash = result.metadata.optHash as string;
        const generatedPayloads = result.metadata.payloads as ArtworkPayload[];

        const artworkData = await db.transaction(async (trx) => {
          // Query existing artworks by hash
          const existingArtworks = await trx
            .select()
            .from(artworks)
            .where(inArray(artworks.hash, [fullHash, optHash]));

          const existingHashes = new Set(existingArtworks.map((a) => a.hash));
          const missingPayloads = generatedPayloads.filter((p) => !existingHashes.has(p.hash));

          let newlySavedArtworks: (typeof artworks.$inferSelect)[] = [];
          if (missingPayloads.length > 0) {
            newlySavedArtworks = await saveArtworks(missingPayloads, trx);
          }

          const combinedArtworks = [...existingArtworks, ...newlySavedArtworks];

          // Link all artwork components (full + optimized) to album
          if (combinedArtworks.length > 0) {
            await linkArtworksToAlbum(
              combinedArtworks.map((artwork) => ({
                albumId: this.albumId,
                artworkId: artwork.id
              })),
              trx
            );
          }

          return combinedArtworks;
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
