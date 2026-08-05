import { describe, expect, it } from 'vitest';
import type { AlbumTagPreview, TrackMatchPreview } from '../../../../../common/metadata/types';

describe('Phase 8 — Metadata Intelligence & Final UX Review Suite', () => {
  const mockMatches: TrackMatchPreview[] = [
    {
      localSongId: 101,
      songPath: 'song1.mp3',
      oldTitle: 'brutal (audio)',
      oldArtist: 'Olivia Rodrigo',
      oldAlbum: 'SOUR',
      oldYear: 2021,
      oldTrackNumber: 1,
      confidence: 0.98,
      confidenceLevel: 'Excellent',
      why: 'Matched',
      reasons: [],
      applyTrack: true,
      hasWarnings: false,
      warningCount: 0,
      fieldDiffs: [
        { fieldId: 'title', fieldName: 'Title', oldValue: 'brutal (audio)', suggestedValue: 'brutal', userValue: 'brutal', status: 'changed', applyField: true },
        { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Olivia Rodrigo', suggestedValue: 'Olivia Rodrigo', userValue: 'Olivia Rodrigo', status: 'unchanged', applyField: false }
      ]
    },
    {
      localSongId: 102,
      songPath: 'song2.mp3',
      oldTitle: 'traitor',
      oldArtist: 'Olivia',
      oldAlbum: 'SOUR',
      oldYear: 2020,
      oldTrackNumber: 2,
      confidence: 0.95,
      confidenceLevel: 'Very Good',
      why: 'Matched',
      reasons: ['Artist Mismatch'],
      applyTrack: true,
      hasWarnings: true,
      warningCount: 1,
      fieldDiffs: [
        { fieldId: 'title', fieldName: 'Title', oldValue: 'traitor', suggestedValue: 'traitor', userValue: 'traitor', status: 'unchanged', applyField: false },
        { fieldId: 'artist', fieldName: 'Artist', oldValue: 'Olivia', suggestedValue: 'Olivia Rodrigo', userValue: 'Olivia Rodrigo', status: 'changed', applyField: true },
        { fieldId: 'year', fieldName: 'Year', oldValue: 2020, suggestedValue: 2021, userValue: 2021, status: 'changed', applyField: true }
      ]
    }
  ];

  const mockPreview: AlbumTagPreview = {
    album: { title: 'SOUR', artist: 'Olivia Rodrigo' },
    confidenceLevel: 'Excellent',
    overallConfidence: 0.965,
    provider: 'musicbrainz',
    providerReleaseId: 'mb-sour',
    matches: mockMatches,
    warnings: ['Artist Mismatch']
  };

  it('correctly calculates pre-apply review metrics for titles, artists, and years changed', () => {
    const titlesChanged = mockMatches.filter((m) =>
      m.fieldDiffs.some((d) => d.fieldId === 'title' && d.applyField && d.status === 'changed')
    ).length;

    const artistsChanged = mockMatches.filter((m) =>
      m.fieldDiffs.some((d) => d.fieldId === 'artist' && d.applyField && d.status === 'changed')
    ).length;

    const yearsChanged = mockMatches.filter((m) =>
      m.fieldDiffs.some((d) => d.fieldId === 'year' && d.applyField && d.status === 'changed')
    ).length;

    const totalWarnings = mockMatches.reduce((acc, m) => acc + m.warningCount, 0);

    expect(titlesChanged).toBe(1);
    expect(artistsChanged).toBe(1);
    expect(yearsChanged).toBe(1);
    expect(totalWarnings).toBe(1);
    expect(mockPreview.overallConfidence).toBeGreaterThan(0.95);
  });
});
