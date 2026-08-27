import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlbumById } from '@main/db/queries/albums';
import { linkArtworksToAlbum, saveArtworks } from '@main/db/queries/artworks';
import { db } from '@main/db/db';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { ArtworkJob, CURRENT_ARTWORK_GENERATOR_VERSION } from '../artworkJob';

vi.mock('@main/db/queries/albums', () => ({
  getAlbumById: vi.fn()
}));

vi.mock('@main/db/queries/artworks', () => ({
  linkArtworksToAlbum: vi.fn(),
  saveArtworks: vi.fn()
}));

vi.mock('@main/db/db', () => ({
  db: {
    transaction: vi.fn()
  }
}));

vi.mock('@main/workers/process/MediaWorkerBridge', () => ({
  mediaWorkerBridge: {
    generateAsset: vi.fn()
  }
}));

describe('ArtworkJob (Phase C4-B)', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('should skip processing and emit event if album already has up-to-date artwork in DB', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: [
        {
          artwork: {
            id: 10,
            path: '/artworks/10.webp',
            isOptimized: true,
            generatorVersion: CURRENT_ARTWORK_GENERATOR_VERSION
          }
        }
      ]
    } as any);

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await job.execute();

    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.ARTWORK_CREATED, {
      albumId: 1,
      artworkId: 10,
      path: '/artworks/10.webp',
      albumTitle: 'Test Album'
    });
    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('should delegate Taglib & Sharp processing to mediaWorkerBridge, commit to DB, and emit ARTWORK_CREATED', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: '/artworks/hash.webp',
      metadata: {
        hasEmbeddedArtwork: true,
        isDefaultArtwork: false,
        fullHash: 'hash',
        optHash: 'hash-optimized',
        payloads: [
          { hash: 'hash', path: '/artworks/hash.webp', isOptimized: false, width: 500, height: 500, source: 'LOCAL' },
          { hash: 'hash-optimized', path: '/artworks/hash-optimized.webp', isOptimized: true, width: 50, height: 50, source: 'LOCAL' }
        ]
      }
    });

    const savedArtworkData = [{ id: 10, path: '/artworks/hash-optimized.webp', isOptimized: true }];
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      const mockTrx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([])
          })
        })
      };
      vi.mocked(saveArtworks).mockResolvedValue(savedArtworkData as any);
      return callback(mockTrx as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await job.execute();

    expect(mediaWorkerBridge.generateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'artwork',
        sourceFilePath: '/music/song.mp3'
      })
    );
    expect(db.transaction).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.ARTWORK_CREATED, {
      albumId: 1,
      artworkId: 10,
      path: '/artworks/hash-optimized.webp',
      albumTitle: 'Test Album'
    });
  });

  it('throws error when worker asset generation fails so scheduler can handle retries', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false,
      error: 'Worker process crashed'
    });

    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await expect(job.execute()).rejects.toThrow('Worker process crashed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('A-1 REGRESSION: must emit ARTWORK_CREATED even if job state is cancelled post-commit', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: true,
      outputFilePath: '/artworks/hash.webp',
      metadata: {
        hasEmbeddedArtwork: true,
        fullHash: 'hash',
        optHash: 'hash-optimized',
        payloads: [{ hash: 'hash', path: '/artworks/10.webp', isOptimized: true }]
      }
    });

    const savedArtworkData = [{ id: 10, path: '/artworks/10.webp', isOptimized: true }];
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      const mockTrx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([])
          })
        })
      };
      vi.mocked(saveArtworks).mockResolvedValue(savedArtworkData as any);
      const res = await callback(mockTrx as any);
      // Simulate cancellation arriving right as the DB transaction commits
      job.state = 'cancelled';
      return res;
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    // Invariant: If committed, event MUST still fire!
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.ARTWORK_CREATED, {
      albumId: 1,
      artworkId: 10,
      path: '/artworks/10.webp',
      albumTitle: 'Test Album'
    });
  });
});
