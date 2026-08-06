import { describe, expect, it, vi } from 'vitest';
import { MetadataOperationManager } from '../MetadataOperationManager';
import { MetadataResolutionManager } from '../../resolution/MetadataResolutionManager';
import type { AlbumMetadataService } from '../../services/AlbumMetadataService';

describe('Phase 13B — Engine Refactor & Operation Resolution Blueprint Test Suite', () => {
  it('manages operation lifecycles via MetadataOperationManager', () => {
    const manager = new MetadataOperationManager();
    const op = manager.createOperation('op-1', 'AlbumResolution', [101, 102], 'Interactive');

    expect(op.state).toBe('Created');
    expect(op.targetResourceIds).toEqual([101, 102]);

    const updated = manager.updateState('op-1', 'Searching', 'Searching MusicBrainz...', 20);
    expect(updated?.state).toBe('Searching');
    expect(updated?.startedAt).toBeDefined();

    const completed = manager.updateState('op-1', 'Completed', 'Done', 100);
    expect(completed?.state).toBe('Completed');
    expect(completed?.completedAt).toBeDefined();
  });

  it('executes candidate resolution via MetadataResolutionManager', async () => {
    const mockAlbumMetadataService = {
      searchAlbums: vi.fn().mockResolvedValue([
        { id: 'mb-sour', title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021, provider: 'musicbrainz', score: 0.98 }
      ])
    } as unknown as AlbumMetadataService;

    const resolutionManager = new MetadataResolutionManager({
      albumMetadataService: mockAlbumMetadataService
    });
    const opManager = new MetadataOperationManager(resolutionManager);

    opManager.createOperation('op-sour', 'AlbumResolution', [201], 'Interactive');
    const resolution = await opManager.executeResolution('op-sour', { albumTitle: 'SOUR', artistName: 'Olivia Rodrigo' });

    expect(resolution).toBeDefined();
    expect(resolution?.candidates).toHaveLength(1);
    expect(resolution?.candidates[0].title).toBe('SOUR');
    expect(resolution?.candidates[0].providerId).toBe('musicbrainz');

    const finalOp = opManager.getOperation('op-sour');
    expect(finalOp?.state).toBe('PreviewReady');
  });
});
