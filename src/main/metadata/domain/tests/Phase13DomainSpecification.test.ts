import { describe, expect, it } from 'vitest';
import type { MetadataOperation } from '../MetadataOperation';
import type { MetadataPolicy } from '../MetadataPolicy';
import type { MetadataPreview } from '../MetadataPreview';
import type { MetadataTransaction } from '../MetadataTransaction';
import type { UndoToken } from '../UndoToken';
import type { ProviderAttribution } from '../ProviderAttribution';
import type { MetadataHealth } from '../MetadataHealth';

describe('Phase 13A — Domain Model & Specification Blueprint Test Suite', () => {
  it('instantiates pure MetadataOperation domain entity contracts', () => {
    const op: MetadataOperation = {
      id: 'op-101',
      type: 'AlbumResolution',
      mode: 'Interactive',
      state: 'Created',
      progressMessage: 'Initialized',
      progressPercent: 0,
      createdAt: Date.now()
    };

    expect(op.id).toBe('op-101');
    expect(op.type).toBe('AlbumResolution');
    expect(op.state).toBe('Created');
  });

  it('defines declarative MetadataPolicy hierarchy contracts', () => {
    const policy: MetadataPolicy = {
      level: 'operation',
      selection: { enabledProviderIds: ['musicbrainz', 'discogs'], maxCandidates: 10 },
      merge: {
        providerPriorities: { user: 1000, discogs: 600, musicbrainz: 500 },
        fieldPolicies: {
          genre: { fieldId: 'genre', preferredProviderId: 'discogs' }
        }
      },
      fallback: { allowLocalFallback: true, allowEmptyFallbacks: false },
      validation: { strictMode: true, requireTitle: true, requireArtist: true }
    };

    expect(policy.selection.enabledProviderIds).toContain('discogs');
    expect(policy.merge.fieldPolicies?.genre.preferredProviderId).toBe('discogs');
  });

  it('instantiates pure MetadataPreview contracts with ProviderAttribution', () => {
    const attribution: ProviderAttribution = {
      fieldId: 'title',
      providerId: 'musicbrainz',
      providerName: 'MusicBrainz',
      confidenceScore: 0.98
    };

    const preview: MetadataPreview = {
      operationId: 'op-101',
      resourceId: 42,
      overallConfidence: 0.98,
      fieldChanges: [
        {
          fieldId: 'title',
          fieldName: 'Title',
          oldValue: 'brutal (audio)',
          suggestedValue: 'brutal',
          userValue: 'brutal',
          status: 'changed',
          applyField: true,
          attribution
        }
      ],
      attributions: [attribution],
      warnings: [],
      conflicts: [],
      applyResource: true
    };

    expect(preview.overallConfidence).toBe(0.98);
    expect(preview.fieldChanges[0].attribution?.providerName).toBe('MusicBrainz');
  });

  it('instantiates MetadataTransaction and UndoToken contracts', () => {
    const undoToken: UndoToken = {
      id: 'undo-1',
      operationId: 'op-101',
      timestamp: Date.now(),
      description: 'Album Resolution apply for SOUR',
      affectedResourceIds: [42]
    };

    const transaction: MetadataTransaction = {
      id: 'tx-1',
      operationId: 'op-101',
      createdAt: Date.now(),
      state: 'created',
      mutations: [
        {
          resourceId: 42,
          filePath: 'song.mp3',
          fieldChanges: { title: 'brutal' }
        }
      ],
      undoToken
    };

    expect(transaction.undoToken?.id).toBe('undo-1');
    expect(transaction.mutations[0].fieldChanges.title).toBe('brutal');
  });

  it('instantiates generic MetadataHealth quality score contracts', () => {
    const health: MetadataHealth = {
      resourceId: 42,
      resourceType: 'track',
      score: 100,
      rating: 'Excellent',
      issues: [],
      assessedAt: Date.now()
    };

    expect(health.score).toBe(100);
    expect(health.rating).toBe('Excellent');
  });
});
