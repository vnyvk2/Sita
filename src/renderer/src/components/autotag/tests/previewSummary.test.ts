// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { AlbumTagPreview, MetadataFieldDiff, TrackMatchPreview } from '../../../../common/metadata/types';
import {
  computeFederationSummary,
  getChangedFieldDiffs,
  getTrackChangeCount,
  isFieldChanged,
  isInteractiveElement
} from '../utils/previewSummary';

describe('AutoTag Preview Summary Utilities', () => {
  const mockDiff = (
    fieldId: any,
    status: any,
    providerId?: string,
    providerName?: string
  ): MetadataFieldDiff => ({
    fieldId,
    fieldName: String(fieldId),
    status,
    applyField: true,
    providerId,
    providerName,
    oldValue: status === 'new' ? undefined : 'old',
    suggestedValue: status === 'missing' ? undefined : 'new'
  });

  describe('isFieldChanged & getChangedFieldDiffs', () => {
    it('identifies changed and new fields as semantic changes', () => {
      expect(isFieldChanged(mockDiff('title', 'changed'))).toBe(true);
      expect(isFieldChanged(mockDiff('genre', 'new'))).toBe(true);
      expect(isFieldChanged(mockDiff('artist', 'unchanged'))).toBe(false);
      expect(isFieldChanged(mockDiff('isrc', 'missing'))).toBe(false);
    });

    it('filters track diffs to only changed/new fields', () => {
      const track: TrackMatchPreview = {
        localSongId: 1,
        songPath: '/song.mp3',
        oldTitle: 'Track 1',
        confidence: 0.95,
        confidenceLevel: 'High',
        why: 'exact match',
        reasons: [],
        applyTrack: true,
        hasWarnings: false,
        warningCount: 0,
        fieldDiffs: [
          mockDiff('title', 'changed', 'musicbrainz', 'MusicBrainz'),
          mockDiff('artist', 'unchanged', 'musicbrainz', 'MusicBrainz'),
          mockDiff('genre', 'new', 'discogs', 'Discogs'),
          mockDiff('isrc', 'missing', 'musicbrainz', 'MusicBrainz')
        ]
      };

      const changed = getChangedFieldDiffs(track);
      expect(changed).toHaveLength(2);
      expect(changed.map((d) => d.fieldId)).toEqual(['title', 'genre']);
      expect(getTrackChangeCount(track)).toBe(2);
    });
  });

  describe('computeFederationSummary', () => {
    it('calculates provider contributions accurately from changed/new fields only', () => {
      const preview: AlbumTagPreview = {
        album: {
          title: 'SOUR',
          artist: 'Olivia Rodrigo',
          coverArtUrl: 'https://archive.org/cover.jpg'
        },
        matches: [
          {
            localSongId: 1,
            songPath: '/song1.mp3',
            oldTitle: 'brutal',
            confidence: 0.98,
            confidenceLevel: 'High',
            why: '',
            reasons: [],
            applyTrack: true,
            hasWarnings: false,
            warningCount: 0,
            fieldDiffs: [
              mockDiff('title', 'changed', 'musicbrainz', 'MusicBrainz'), // MB change #1
              mockDiff('trackNumber', 'new', 'musicbrainz', 'MusicBrainz'), // MB change #2
              mockDiff('genre', 'new', 'discogs', 'Discogs'), // Discogs change #1
              mockDiff('year', 'unchanged', 'discogs', 'Discogs') // Unchanged -> not counted
            ]
          },
          {
            localSongId: 2,
            songPath: '/song2.mp3',
            oldTitle: 'traitor',
            confidence: 0.95,
            confidenceLevel: 'High',
            why: '',
            reasons: [],
            applyTrack: true,
            hasWarnings: false,
            warningCount: 0,
            fieldDiffs: [
              mockDiff('title', 'changed', 'musicbrainz', 'MusicBrainz'), // MB change #3
              mockDiff('genre', 'new', 'discogs', 'Discogs'), // Discogs change #2
              mockDiff('isrc', 'missing', 'musicbrainz', 'MusicBrainz') // Missing -> not counted
            ]
          }
        ],
        warnings: [],
        overallConfidence: 0.96,
        confidenceLevel: 'High',
        provider: 'musicbrainz',
        providerReleaseId: 'mb-rel-1'
      };

      const summary = computeFederationSummary(preview);

      expect(summary.totalChangedFields).toBe(5);
      expect(summary.providerContributions).toHaveLength(2);
      expect(summary.providerContributions[0]).toEqual({
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        fieldCount: 3
      });
      expect(summary.providerContributions[1]).toEqual({
        providerId: 'discogs',
        providerName: 'Discogs',
        fieldCount: 2
      });
      expect(summary.artworkProvider).toBe('Cover Art Archive');
    });
  });

  describe('isInteractiveElement', () => {
    it('returns true for input, textarea, and select controls', () => {
      const input = document.createElement('input');
      const textarea = document.createElement('textarea');
      const select = document.createElement('select');
      const div = document.createElement('div');

      expect(isInteractiveElement(input)).toBe(true);
      expect(isInteractiveElement(textarea)).toBe(true);
      expect(isInteractiveElement(select)).toBe(true);
      expect(isInteractiveElement(div)).toBe(false);
      expect(isInteractiveElement(null)).toBe(false);
    });
  });
});
