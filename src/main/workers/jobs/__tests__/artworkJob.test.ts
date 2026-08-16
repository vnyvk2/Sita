import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAlbumById } from '@main/db/queries/albums';
import { linkArtworksToAlbum, saveArtworks } from '@main/db/queries/artworks';
import { db } from '@main/db/db';
import { processArtworkFiles } from '@main/other/artworks';
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

vi.mock('@main/other/artworks', () => ({
  processArtworkFiles: vi.fn()
}));

const mockDispose = vi.fn();
vi.mock('node-taglib-sharp', () => ({
  File: {
    createFromPath: vi.fn(() => ({
      tag: {
        pictures: [
          {
            data: {
              toByteArray: () => new Uint8Array([1, 2, 3])
            }
          }
        ]
      },
      dispose: mockDispose
    }))
  }
}));

describe('ArtworkJob', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus = new EventEmitter();
  });

  it('should skip processing and emit event if album already has up-to-date artwork', async () => {
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
    expect(processArtworkFiles).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('should process ID3 tag, save artwork to DB, and emit ARTWORK_CREATED', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    vi.mocked(processArtworkFiles).mockResolvedValue({
      payloads: [{ path: '/artworks/10.webp', isOptimized: true }]
    } as any);

    const savedArtworkData = [{ id: 10, path: '/artworks/10.webp', isOptimized: true }];
    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      vi.mocked(saveArtworks).mockResolvedValue(savedArtworkData as any);
      return callback({} as any);
    });

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    await job.execute();

    expect(mockDispose).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(ASSET_EVENTS.ARTWORK_CREATED, {
      albumId: 1,
      artworkId: 10,
      path: '/artworks/10.webp',
      albumTitle: 'Test Album'
    });
  });

  it('A-1 REGRESSION: must emit ARTWORK_CREATED even if job state is cancelled post-commit', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    vi.mocked(processArtworkFiles).mockResolvedValue({
      payloads: [{ path: '/artworks/10.webp', isOptimized: true }]
    } as any);

    const savedArtworkData = [{ id: 10, path: '/artworks/10.webp', isOptimized: true }];
    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);

    vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
      vi.mocked(saveArtworks).mockResolvedValue(savedArtworkData as any);
      const res = await callback({} as any);
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

  it('should abort cleanly before DB transaction if cancelled during processing', async () => {
    vi.mocked(getAlbumById).mockResolvedValue({
      id: 1,
      title: 'Test Album',
      artworks: []
    } as any);

    const job = new ArtworkJob(1, '/music/song.mp3', 'Test Album', eventBus);
    job.state = 'cancelled';

    const emitSpy = vi.spyOn(eventBus, 'emit');
    await job.execute();

    expect(processArtworkFiles).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should handle missing album gracefully without throwing', async () => {
    vi.mocked(getAlbumById).mockResolvedValue(null as any);

    const emitSpy = vi.spyOn(eventBus, 'emit');
    const job = new ArtworkJob(999, '/music/song.mp3', 'Missing Album', eventBus);

    await job.execute();

    expect(processArtworkFiles).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});
