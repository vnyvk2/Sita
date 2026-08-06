import { describe, expect, it, vi } from 'vitest';
import { MetadataOperationManager } from '../MetadataOperationManager';
import { MetadataResolutionManager } from '../../resolution/MetadataResolutionManager';
import type { MetadataLookupGateway } from '../../resolution/MetadataLookupGateway';
import type { MetadataContext } from '../../domain/MetadataContext';

describe('Phase 13B — Engine Refactor & Operation Resolution Blueprint Test Suite', () => {
  const dummyContext: MetadataContext = {
    resources: {
      primaryType: 'album',
      targetResources: [{ id: 101, type: 'album', attributes: {} }]
    },
    execution: { mode: 'Interactive' }
  };

  it('manages operation lifecycles via MetadataOperationManager', () => {
    const manager = new MetadataOperationManager();
    const op = manager.createOperation('op-1', 'AlbumResolution', dummyContext, 'Interactive');

    expect(op.state).toBe('Created');
    expect(op.targetResourceIds).toEqual([101]);
    expect(op.context.resources.primaryType).toBe('album');

    const updated = manager.updateState('op-1', 'Searching', 'Searching MusicBrainz...', 20);
    expect(updated?.state).toBe('Searching');
    expect(updated?.startedAt).toBeDefined();

    const completed = manager.updateState('op-1', 'Completed', 'Done', 100);
    expect(completed?.state).toBe('Completed');
    expect(completed?.completedAt).toBeDefined();
  });

  it('executes candidate resolution via MetadataLookupGateway with embedded MetadataContext', async () => {
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

    const context: MetadataContext = {
      resources: {
        primaryType: 'album',
        targetResources: [{ id: 201, type: 'album', attributes: {} }]
      },
      execution: { mode: 'Interactive' },
      request: {
        id: 'req-1',
        query: { albumTitle: 'SOUR', artistName: 'Olivia Rodrigo' },
        requestedAt: Date.now()
      }
    };

    opManager.createOperation('op-sour', 'AlbumResolution', context, 'Interactive');
    const resolution = await opManager.executeResolution('op-sour');

    expect(resolution).toBeDefined();
    expect(resolution?.candidates).toHaveLength(1);
    expect(resolution?.candidates[0].title).toBe('SOUR');
    expect(resolution?.candidates[0].providerId).toBe('musicbrainz');

    const finalOp = opManager.getOperation('op-sour');
    expect(finalOp?.state).toBe('PreviewReady');
  });

  it('handles resolution failures gracefully without returning fake empty candidate objects', async () => {
    const opManager = new MetadataOperationManager(); // No resolution manager configured

    const context: MetadataContext = {
      resources: {
        primaryType: 'album',
        targetResources: [{ id: 301, type: 'album', attributes: {} }]
      },
      execution: { mode: 'Interactive' }
    };

    opManager.createOperation('op-fail', 'AlbumResolution', context, 'Interactive');
    const res = await opManager.executeResolution('op-fail');

    expect(res).toBeUndefined();
    const failedOp = opManager.getOperation('op-fail');
    expect(failedOp?.state).toBe('Failed');
    expect(failedOp?.progressMessage).toContain('Resolution manager unavailable');
  });
});
