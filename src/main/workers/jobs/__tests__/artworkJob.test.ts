import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlbumById } from '@main/db/queries/albums';
import { saveArtworks } from '@main/db/queries/artworks';
import { db } from '@main/db/db';
import { DEFAULT_ARTWORK_SAVE_LOCATION } from '@main/filesystem';
import { mediaWorkerBridge } from '@main/workers/process/MediaWorkerBridge';
import { ASSET_EVENTS } from '../../libraryChoreography';
import { ArtworkJob, CURRENT_ARTWORK_GENERATOR_VERSION } from '../artworkJob';

vi.mock('@main/db/queries/albums', () => ({
  getAlbumById: vi.fn()
}));

vi.mock('@main/db/queries/artworks', () => ({
  // artworkJob re-exports CURRENT_ARTWORK_GENERATOR_VERSION from this module,
  // so the mock must provide it (value mirrors the real export).
  CURRENT_ARTWORK_GENERATOR_VERSION: 1,
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

  it('handles missing album gracefully without throwing', async () => {
    vi.mocked(getAlbumById).mockResolvedValue(null as any);

    const job = new ArtworkJob(999, '/music/song.mp3', 'Nonexistent', eventBus);
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('skips processing and emits event if album already has up-to-date artwork in DB (Idempotency)', async () => {
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

  describe('Artwork Hash Reuse Permutations', () => {
    const payloads = [
      { hash: 'full_hash', path: '/artworks/full.webp', isOptimized: false, width: 500, height: 500, source: 'LOCAL' as const },
      { hash: 'opt_hash', path: '/artworks/opt.webp', isOptimized: true, width: 50, height: 50, source: 'LOCAL' as const }
    ];

    it('case 1: neither hash exists -> saveArtworks saves both, linkArtworksToAlbum links both', async () => {
      vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
      vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
        success: true,
        outputFilePath: '/artworks/full.webp',
        metadata: {
          hasEmbeddedArtwork: true,
          fullHash: 'full_hash',
          optHash: 'opt_hash',
          payloads
        }
      });

      const savedArtworks = [
        { id: 10, hash: 'full_hash', path: '/artworks/full.webp', isOptimized: false },
        { id: 11, hash: 'opt_hash', path: '/artworks/opt.webp', isOptimized: true }
      ];

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockTrx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]) // neither exists
            })
          })
        };
        vi.mocked(saveArtworks).mockResolvedValue(savedArtworks as any);
        return callback(mockTrx as any);
      });

      const emitSpy = vi.spyOn(eventBus, 'emit');
      const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);
      await job.execute();

      expect(mediaWorkerBridge.generateAsset).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'artwork',
          destinationPath: DEFAULT_ARTWORK_SAVE_LOCATION
        })
      );
      expect(saveArtworks).toHaveBeenCalledWith(payloads, expect.anything());
      expect(linkArtworksToAlbum).toHaveBeenCalledWith(
        [
          { albumId: 1, artworkId: 10 },
          { albumId: 1, artworkId: 11 }
        ],
        expect.anything()
      );
      expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.ARTWORK_CREATED, {
        albumId: 1,
        artworkId: 11,
        path: '/artworks/opt.webp',
        albumTitle: 'Test Album'
      });
    });

    it('case 2: both hashes exist in DB -> reuses existing without calling saveArtworks', async () => {
      vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
      vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
        success: true,
        outputFilePath: '/artworks/full.webp',
        metadata: {
          hasEmbeddedArtwork: true,
          fullHash: 'full_hash',
          optHash: 'opt_hash',
          payloads
        }
      });

      const existingArtworksInDB = [
        { id: 10, hash: 'full_hash', path: '/artworks/full.webp', isOptimized: false },
        { id: 11, hash: 'opt_hash', path: '/artworks/opt.webp', isOptimized: true }
      ];

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockTrx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(existingArtworksInDB) // both exist
            })
          })
        };
        return callback(mockTrx as any);
      });

      const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);
      await job.execute();

      expect(saveArtworks).not.toHaveBeenCalled();
      expect(linkArtworksToAlbum).toHaveBeenCalledWith(
        [
          { albumId: 1, artworkId: 10 },
          { albumId: 1, artworkId: 11 }
        ],
        expect.anything()
      );
    });

    it('case 3: full exists but optimized is missing -> saveArtworks only saves missing opt and links both', async () => {
      vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
      vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
        success: true,
        outputFilePath: '/artworks/full.webp',
        metadata: {
          hasEmbeddedArtwork: true,
          fullHash: 'full_hash',
          optHash: 'opt_hash',
          payloads
        }
      });

      const existingFullOnly = [
        { id: 10, hash: 'full_hash', path: '/artworks/full.webp', isOptimized: false }
      ];
      const newlySavedOpt = [
        { id: 11, hash: 'opt_hash', path: '/artworks/opt.webp', isOptimized: true }
      ];

      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockTrx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(existingFullOnly) // only full exists
            })
          })
        };
        vi.mocked(saveArtworks).mockResolvedValue(newlySavedOpt as any);
        return callback(mockTrx as any);
      });

      const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);
      await job.execute();

      // Verify saveArtworks was called ONLY for the missing 'opt_hash' payload
      expect(saveArtworks).toHaveBeenCalledWith(
        [payloads[1]],
        expect.anything()
      );
      // Verify both are linked to the album
      expect(linkArtworksToAlbum).toHaveBeenCalledWith(
        [
          { albumId: 1, artworkId: 10 },
          { albumId: 1, artworkId: 11 }
        ],
        expect.anything()
      );
    });
  });

  it('throws error when worker asset generation fails so scheduler can handle retries', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockRejectedValue(
      new Error('Worker process crashed')
    );

    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await expect(job.execute()).rejects.toThrow('Worker process crashed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('throws error when generateAsset returns success: false without cancelled flag', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
    vi.mocked(mediaWorkerBridge.generateAsset).mockResolvedValue({
      success: false
    });

    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await expect(job.execute()).rejects.toThrow('Failed to generate artwork for album 1');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts cleanly before DB transaction if cancelled during processing', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    vi.mocked(mediaWorkerBridge.generateAsset).mockImplementation(async () => {
      job.state = 'cancelled';
      return {
        success: true,
        outputFilePath: '/artworks/hash.webp',
        metadata: { hasEmbeddedArtwork: true, fullHash: 'h', optHash: 'h-opt', payloads: [] }
      };
    });

    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('aborts immediately without calling worker if cancelled before execution', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);
    job.cancel();

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(mediaWorkerBridge.generateAsset).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('aborts and suppresses DB persistence and events when cancel() is called mid-flight', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({ id: 1, title: 'Test Album', artworks: [] } as any);
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    vi.mocked(mediaWorkerBridge.generateAsset).mockImplementation(async (opts) => {
      // Calling cancel() aborts controller and updates state
      job.cancel();
      expect(opts.abortSignal?.aborted).toBe(true);
      return {
        success: false,
        cancelled: true
      };
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
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
