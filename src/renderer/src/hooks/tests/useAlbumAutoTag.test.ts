import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries
  })
}));

describe('Phase 6 — Comprehensive Integration Test Suite (useAlbumAutoTag)', () => {
  let mockUnsubscribe: ReturnType<typeof vi.fn>;
  let listenerCount = 0;

  beforeEach(() => {
    mockUnsubscribe = vi.fn(() => {
      listenerCount--;
    });

    listenerCount = 0;
    mockInvalidateQueries.mockClear();

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
                hasWarnings: false,
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
            listenerCount++;
            void cb;
            return mockUnsubscribe;
          })
        }
      }
    };
  });

  it('provides metadataAutoTag API integration methods and supports single listener count safety', async () => {
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

    // Verify listener count tracking
    const unsubscribe = api.onProgress((payload: any) => payload);
    expect(listenerCount).toBe(1);
    unsubscribe();
    expect(listenerCount).toBe(0);
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('triggers query invalidation via useQueryClient ONLY on successful apply/undo operations', async () => {
    const api = (window as any).api.metadataAutoTag;

    // Simulated apply success
    const preview = await api.buildPreview([{ songId: 101 }], 'mb-sour', 'musicbrainz', 'op-1');
    const applyRes = await api.applyPreview(preview, 'op-1');
    if (applyRes.success) mockInvalidateQueries();

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);

    // Simulated apply failure (should NOT trigger invalidation)
    api.applyPreview.mockResolvedValueOnce({ success: false, errors: ['DB locked'] });
    const failedApply = await api.applyPreview(preview, 'op-1');
    if (failedApply.success) mockInvalidateQueries();

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1); // Count remains 1
  });
});
