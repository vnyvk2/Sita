import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAlbumAutoTag } from '../useAlbumAutoTag';

describe('Phase 5 — React UI & Hook Integration Suite (useAlbumAutoTag)', () => {
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let mockProgressCallback: ((payload: any) => void) | null = null;

  beforeEach(() => {
    mockUnsubscribe = vi.fn();
    mockProgressCallback = null;

    (globalThis as any).window = {
      api: {
        metadataAutoTag: {
          searchAlbums: vi.fn().mockResolvedValue([
            { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021, releaseId: 'mb-sour', provider: 'musicbrainz' }
          ]),
          buildPreview: vi.fn().mockResolvedValue({
            album: { title: 'SOUR', artist: 'Olivia Rodrigo' },
            confidenceLevel: 'Excellent',
            overallConfidence: 0.98,
            provider: 'musicbrainz',
            providerReleaseId: 'mb-sour',
            matches: [
              {
                localSongId: 101,
                oldTitle: 'brutal (audio)',
                confidence: 0.98,
                confidenceLevel: 'Excellent',
                applyTrack: true,
                fieldDiffs: [
                  { fieldId: 'title', fieldName: 'Title', oldValue: 'brutal (audio)', suggestedValue: 'brutal', userValue: 'brutal', status: 'changed', applyField: true }
                ]
              }
            ]
          }),
          applyPreview: vi.fn().mockResolvedValue({ success: true, updatedCount: 1 }),
          undoLastAutoTag: vi.fn().mockResolvedValue({ success: true, restoredCount: 1 }),
          cancelAutoTag: vi.fn(),
          onProgress: vi.fn((cb) => {
            mockProgressCallback = cb;
            return mockUnsubscribe;
          })
        }
      }
    };
  });

  it('provides metadataAutoTag API integration methods', async () => {
    const api = (window as any).api.metadataAutoTag;
    const candidates = await api.searchAlbums('SOUR', 'Olivia Rodrigo', 10, 'op-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('SOUR');

    const preview = await api.buildPreview([{ songId: 101 }], 'mb-sour', 'musicbrainz', 'op-1');
    expect(preview.overallConfidence).toBe(0.98);

    const applyRes = await api.applyPreview(preview, 'op-1');
    expect(applyRes.success).toBe(true);

    const undoRes = await api.undoLastAutoTag('op-1');
    expect(undoRes.success).toBe(true);

    // Verify onProgress subscriber returns unsubscribe function
    const unsubscribe = api.onProgress((payload: any) => payload);
    expect(unsubscribe).toBeDefined();
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
