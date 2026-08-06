import { describe, expect, it, vi } from 'vitest';
import { MetadataOperationManager } from '../MetadataOperationManager';
import { MetadataResolutionManager } from '../../resolution/MetadataResolutionManager';
import type { MetadataLookupGateway } from '../../resolution/MetadataLookupGateway';

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

  it('executes candidate resolution via MetadataLookupGateway without leaking AlbumMetadataService', async () => {
    const mockLookupGateway: MetadataLookupGateway = {
      searchCandidates: vi.fn().mockResolvedValue([
        {
          providerId: 'musicbrainz',
          providerName: 'MusicBrainz',
          externalId: 'mb-sour',
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          year: 2021,
          score: 0.98,
          matchedAttributes: { title: 'SOUR' }
        }
      ])
    };

    const resolutionManager = new MetadataResolutionManager(mockLookupGateway);
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

  it('handles resolution failures gracefully without returning fake empty candidate objects', async () => {
    const opManager = new MetadataOperationManager(); // No resolution manager configured

    opManager.createOperation('op-fail', 'AlbumResolution', [301], 'Interactive');
    const res = await opManager.executeResolution('op-fail', { albumTitle: 'Unknown' });

    expect(res).toBeUndefined();
    const failedOp = opManager.getOperation('op-fail');
    expect(failedOp?.state).toBe('Failed');
    expect(failedOp?.progressMessage).toContain('Resolution manager unavailable');
  });
});
