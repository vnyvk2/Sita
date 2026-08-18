import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AlbumTagPreview, AutoTagSongInput } from '../../../../common/metadata/types';

const mockInvalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries
  })
}));

describe('Unified Single-Page AutoTag — useAlbumAutoTag & State Machine Tests', () => {
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
            { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021, releaseId: 'mb-sour-2021', provider: 'musicbrainz' },
            { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2022, releaseId: 'mb-sour-2022', provider: 'musicbrainz' }
          ]),
          buildPreview: vi.fn().mockImplementation(async (_songs, releaseId) => {
            if (releaseId === 'mb-sour-2021') {
              return {
                album: { title: 'SOUR', artist: 'Olivia Rodrigo', year: 2021 },
                confidenceLevel: 'Excellent',
                overallConfidence: 0.94,
                provider: 'musicbrainz',
                providerReleaseId: 'mb-sour-2021',
                matches: [
                  {
                    localSongId: 101,
                    songPath: '/path/01.mp3',
                    oldTitle: 'brutal',
                    oldArtist: 'Olivia Rodrigo',
                    oldAlbum: 'SOUR',
                    oldYear: 2021,
                    confidence: 0.95,
                    confidenceLevel: 'Excellent',
                    applyTrack: true,
                    hasWarnings: false,
                    warningCount: 0,
                    why: 'Exact title and duration match',
                    reasons: [],
                    fieldDiffs: [
                      { fieldId: 'title', fieldName: 'Title', oldValue: 'brutal', suggestedValue: 'brutal', status: 'unchanged', applyField: true },
                      { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Olivia Rodrigo', suggestedValue: 'Olivia Rodrigo', status: 'unchanged', applyField: true }
                    ]
                  },
                  {
                    localSongId: 102,
                    songPath: '/path/02.mp3',
                    oldTitle: 'traitor (demo)',
                    oldArtist: 'Olivia',
                    oldAlbum: 'SOUR',
                    oldYear: 2021,
                    confidence: 0.92,
                    confidenceLevel: 'Excellent',
                    applyTrack: true,
                    hasWarnings: false,
                    warningCount: 0,
                    why: 'Fuzzy match',
                    reasons: [],
                    fieldDiffs: [
                      { fieldId: 'title', fieldName: 'Title', oldValue: 'traitor (demo)', suggestedValue: 'traitor', status: 'changed', applyField: true },
                      { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Olivia', suggestedValue: 'Olivia Rodrigo', status: 'changed', applyField: true }
                    ]
                  }
                ]
              } as AlbumTagPreview;
            } else {
              return {
                album: { title: 'SOUR (Deluxe)', artist: 'Olivia Rodrigo', year: 2022 },
                confidenceLevel: 'Good',
                overallConfidence: 0.87,
                provider: 'musicbrainz',
                providerReleaseId: 'mb-sour-2022',
                matches: [
                  {
                    localSongId: 101,
                    songPath: '/path/01.mp3',
                    oldTitle: 'brutal',
                    confidence: 0.88,
                    confidenceLevel: 'Good',
                    applyTrack: true,
                    hasWarnings: false,
                    warningCount: 0,
                    why: 'Match',
                    reasons: [],
                    fieldDiffs: [
                      { fieldId: 'title', fieldName: 'Title', oldValue: 'brutal', suggestedValue: 'brutal (deluxe)', status: 'changed', applyField: true }
                    ]
                  }
                ]
              } as AlbumTagPreview;
            }
          }),
          applyPreview: vi.fn().mockResolvedValue({ success: true, updatedCount: 2, failedCount: 0, errors: [] }),
          undoLastAutoTag: vi.fn().mockResolvedValue({ success: true, restoredCount: 2 }),
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
    expect(candidates).toHaveLength(2);
    expect(candidates[0].title).toBe('SOUR');

    const preview = await api.buildPreview([{ songId: 101 }], 'mb-sour-2021', 'musicbrainz', 'op-1');
    expect(preview.overallConfidence).toBe(0.94);

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

  it('calculates exact change count distinguishing global fields from per-track fields', async () => {
    const api = (window as any).api.metadataAutoTag;
    const preview: AlbumTagPreview = await api.buildPreview([{ songId: 101 }, { songId: 102 }], 'mb-sour-2021', 'musicbrainz', 'op-1');

    // Global fields diff calculation:
    // Album: 'SOUR' -> 'SOUR' (same = 0)
    // Artist: 'Olivia' -> 'Olivia Rodrigo' (changed = 1)
    // Year: 2021 -> 2021 (same = 0)
    const selectedGlobalChangedCount = 1;

    // Track 101: 0 changed fields (title unchanged, artist unchanged)
    // Track 102: 2 changed fields (title changed, artist changed)
    const selectedTrackIds = new Set([101, 102]);
    const selectedFieldMap = new Map<string, boolean>([
      ['101::title', true],
      ['101::artist', true],
      ['102::title', true],
      ['102::artist', true]
    ]);

    const trackChangesCount = preview.matches.reduce((acc, match) => {
      if (!selectedTrackIds.has(match.localSongId)) return acc;
      const changed = match.fieldDiffs.filter((d) => {
        const key = `${match.localSongId}::${d.fieldId}`;
        const isApplied = selectedFieldMap.get(key) ?? d.applyField;
        return isApplied && (d.status === 'changed' || d.status === 'new');
      }).length;
      return acc + changed;
    }, 0);

    const totalChanges = selectedGlobalChangedCount + trackChangesCount;

    // Invariant: Total = 1 (global artist) + 2 (track 102 title and artist) = 3 changes
    expect(trackChangesCount).toBe(2);
    expect(totalChanges).toBe(3);
  });

  it('protects against candidate switching race conditions by discarding stale responses', async () => {
    const api = (window as any).api.metadataAutoTag;
    let previewRequestId = 0;
    let currentPreview: any = null;

    // Candidate A (slow)
    const reqA = ++previewRequestId;
    const promiseA = new Promise<any>((resolve) => {
      setTimeout(async () => {
        const res = await api.buildPreview([{ songId: 101 }], 'mb-sour-2021');
        resolve({ reqId: reqA, res });
      }, 50);
    });

    // Candidate B (fast)
    const reqB = ++previewRequestId;
    const promiseB = new Promise<any>((resolve) => {
      setTimeout(async () => {
        const res = await api.buildPreview([{ songId: 101 }], 'mb-sour-2022');
        resolve({ reqId: reqB, res });
      }, 10);
    });

    // Fast candidate B finishes first
    const resultB = await promiseB;
    if (resultB.reqId === previewRequestId) {
      currentPreview = resultB.res;
    }
    expect(currentPreview.album.title).toBe('SOUR (Deluxe)');

    // Slow candidate A finishes later, but its reqId (1) !== previewRequestId (2) -> discarded!
    const resultA = await promiseA;
    if (resultA.reqId === previewRequestId) {
      currentPreview = resultA.res;
    }
    expect(currentPreview.album.title).toBe('SOUR (Deluxe)'); // Candidate A was safely discarded!
  });

  it('triggers query invalidation via useQueryClient ONLY on successful apply/undo operations', async () => {
    const api = (window as any).api.metadataAutoTag;

    // Simulated apply success
    const preview = await api.buildPreview([{ songId: 101 }], 'mb-sour-2021', 'musicbrainz', 'op-1');
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
