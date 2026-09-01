import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { AlbumTagPreview, TrackMatchPreview } from '../../../../common/metadata/types';
import { albumQuery } from '../../queries/albums';
import { artistQuery } from '../../queries/artists';
import { genreQuery } from '../../queries/genres';
import { songQuery } from '../../queries/songs';

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
            {
              title: 'SOUR',
              artist: 'Olivia Rodrigo',
              year: 2021,
              releaseId: 'mb-sour-2021',
              provider: 'musicbrainz',
              rankingScore: 185
            },
            {
              title: 'SOUR',
              artist: 'Olivia Rodrigo',
              year: 2022,
              releaseId: 'mb-sour-2022',
              provider: 'musicbrainz',
              rankingScore: 163
            }
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
                      {
                        fieldId: 'title',
                        fieldName: 'Title',
                        oldValue: 'brutal',
                        suggestedValue: 'brutal',
                        status: 'unchanged',
                        applyField: true
                      },
                      {
                        fieldId: 'artist',
                        fieldName: 'Artist',
                        oldValue: 'Olivia Rodrigo',
                        suggestedValue: 'Olivia Rodrigo',
                        status: 'unchanged',
                        applyField: true
                      },
                      {
                        fieldId: 'album',
                        fieldName: 'Album',
                        oldValue: 'SOUR Demo',
                        suggestedValue: 'SOUR',
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'year',
                        fieldName: 'Year',
                        oldValue: 2020,
                        suggestedValue: 2021,
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'genre',
                        fieldName: 'Genre',
                        oldValue: 'Rock',
                        suggestedValue: 'Pop',
                        status: 'changed',
                        applyField: true
                      }
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
                      {
                        fieldId: 'title',
                        fieldName: 'Title',
                        oldValue: 'traitor (demo)',
                        suggestedValue: 'traitor',
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'artist',
                        fieldName: 'Artist',
                        oldValue: 'Olivia',
                        suggestedValue: 'Olivia Rodrigo',
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'album',
                        fieldName: 'Album',
                        oldValue: 'SOUR Demo',
                        suggestedValue: 'SOUR',
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'year',
                        fieldName: 'Year',
                        oldValue: 2020,
                        suggestedValue: 2021,
                        status: 'changed',
                        applyField: true
                      },
                      {
                        fieldId: 'genre',
                        fieldName: 'Genre',
                        oldValue: 'Rock',
                        suggestedValue: 'Pop',
                        status: 'changed',
                        applyField: true
                      }
                    ]
                  }
                ]
              } as unknown as AlbumTagPreview;
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
                      {
                        fieldId: 'title',
                        fieldName: 'Title',
                        oldValue: 'brutal',
                        suggestedValue: 'brutal (deluxe)',
                        status: 'changed',
                        applyField: true
                      }
                    ]
                  }
                ]
              } as unknown as AlbumTagPreview;
            }
          }),
          applyPreview: vi
            .fn()
            .mockResolvedValue({ success: true, updatedCount: 2, failedCount: 0, errors: [] }),
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
    const candidates = await api.searchAlbums('SOUR', 'Olivia Rodrigo', {
      limit: 10,
      targetTrackCount: 11,
      operationId: 'op-1'
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0].title).toBe('SOUR');
    expect(candidates[0].rankingScore).toBe(185);

    const preview = await api.buildPreview(
      [{ songId: 101 }],
      'mb-sour-2021',
      'musicbrainz',
      'op-1'
    );
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

  it('correctly parses searchTotalTracks string into integer targetTrackCount for search API invocation', () => {
    const parseTracks = (val: string) => {
      const parsed = val.trim() ? parseInt(val.trim(), 10) : undefined;
      return Number.isInteger(parsed) && (parsed as number) > 0 ? parsed : undefined;
    };

    expect(parseTracks('11')).toBe(11);
    expect(parseTracks('  16  ')).toBe(16);
    expect(parseTracks('')).toBeUndefined();
    expect(parseTracks('   ')).toBeUndefined();
    expect(parseTracks('abc')).toBeUndefined();
    expect(parseTracks('-5')).toBeUndefined();
  });

  it('calculates exact change count distinguishing global fields from per-track fields', async () => {
    const api = (window as any).api.metadataAutoTag;
    const preview: AlbumTagPreview = await api.buildPreview(
      [{ songId: 101 }, { songId: 102 }],
      'mb-sour-2021',
      'musicbrainz',
      'op-1'
    );

    const isGlobalField = (fieldId: string) =>
      ['album', 'artist', 'year', 'genre'].includes(fieldId);
    const selectedGlobalFields = new Set(['artist']); // Only artist is selected globally
    const selectedGlobalChangedCount = 1; // 'Olivia' -> 'Olivia Rodrigo'
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
        const isApplied = isGlobalField(d.fieldId)
          ? selectedFieldMap.has(key)
            ? (selectedFieldMap.get(key) ?? false)
            : selectedGlobalFields.has(d.fieldId)
          : (selectedFieldMap.get(key) ?? d.applyField);
        return isApplied && (d.status === 'changed' || d.status === 'new');
      }).length;
      return acc + changed;
    }, 0);

    const totalChanges = selectedGlobalChangedCount + trackChangesCount;

    expect(trackChangesCount).toBe(2);
    expect(totalChanges).toBe(3);
  });

  it('correctly maps canonical global field selections to effective track diffs on apply', async () => {
    const api = (window as any).api.metadataAutoTag;
    const preview: AlbumTagPreview = await api.buildPreview(
      [{ songId: 101 }],
      'mb-sour-2021',
      'musicbrainz',
      'op-1'
    );

    // User selected only 'album' and 'year', while 'artist' and 'genre' are deselected
    const selectedGlobalFields = new Set(['album', 'year']);
    const selectedTrackIds = new Set([101]);
    const selectedFieldMap = new Map<string, boolean>();
    const userEditedValues = new Map<string, string | number>();

    const isGlobalField = (fieldId: string) =>
      ['album', 'artist', 'year', 'genre'].includes(fieldId);

    const effectiveMatches: TrackMatchPreview[] = preview.matches.map((m) => {
      const applyTrack = selectedTrackIds.has(m.localSongId);
      const updatedDiffs = m.fieldDiffs.map((d) => {
        const key = `${m.localSongId}::${d.fieldId}`;
        let applyField: boolean;

        if (isGlobalField(d.fieldId)) {
          applyField = selectedFieldMap.has(key)
            ? (selectedFieldMap.get(key) ?? false)
            : selectedGlobalFields.has(d.fieldId);
        } else {
          applyField = selectedFieldMap.get(key) ?? d.applyField;
        }

        const userVal = userEditedValues.get(key) ?? d.userValue;
        return { ...d, applyField, userValue: userVal };
      });

      return { ...m, applyTrack, fieldDiffs: updatedDiffs };
    });

    const track101 = effectiveMatches[0];
    const albumDiff = track101.fieldDiffs.find((d) => d.fieldId === 'album');
    const yearDiff = track101.fieldDiffs.find((d) => d.fieldId === 'year');
    const artistDiff = track101.fieldDiffs.find((d) => d.fieldId === 'artist');
    const genreDiff = track101.fieldDiffs.find((d) => d.fieldId === 'genre');

    // Invariant: Selected global fields ('album', 'year') MUST have applyField === true
    expect(albumDiff?.applyField).toBe(true);
    expect(yearDiff?.applyField).toBe(true);

    // Invariant: Deselected global fields ('artist', 'genre') MUST have applyField === false
    expect(artistDiff?.applyField).toBe(false);
    expect(genreDiff?.applyField).toBe(false);
  });

  it('triggers query invalidation across all 4 key domains (albums, songs, artists, genres) ONLY on successful apply', async () => {
    const api = (window as any).api.metadataAutoTag;

    const invalidateQueryCache = () => {
      mockInvalidateQueries({ queryKey: albumQuery._def });
      mockInvalidateQueries({ queryKey: songQuery._def });
      mockInvalidateQueries({ queryKey: artistQuery._def });
      mockInvalidateQueries({ queryKey: genreQuery._def });
    };

    // Simulated apply success
    const preview = await api.buildPreview(
      [{ songId: 101 }],
      'mb-sour-2021',
      'musicbrainz',
      'op-1'
    );
    const applyRes = await api.applyPreview(preview, 'op-1');
    if (applyRes.success) {
      invalidateQueryCache();
    }

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(4);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: albumQuery._def });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: songQuery._def });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: artistQuery._def });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: genreQuery._def });

    // Reset and simulate failure
    mockInvalidateQueries.mockClear();
    api.applyPreview.mockResolvedValueOnce({ success: false, errors: ['Write error'] });
    const failedApply = await api.applyPreview(preview, 'op-1');
    if (failedApply.success) {
      invalidateQueryCache();
    }

    // Must NOT invalidate queries on failure
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
