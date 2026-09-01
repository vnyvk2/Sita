import { MetadataDiffBuilder } from '@main/metadata/diff/MetadataDiffBuilder';
import type { MergedCandidateResult } from '@main/metadata/resolution/MetadataMergeEngine';
import type { TrackMatchPair, LocalSongInput } from '@main/metadata/services/AlbumMetadataService';
import { describe, expect, it } from 'vitest';

describe('MetadataDiffBuilder', () => {
  const baseMerged: MergedCandidateResult = {
    title: 'OK Computer',
    artist: 'Radiohead',
    album: 'OK Computer',
    year: 1997,
    genre: 'Alternative Rock',
    fieldAttributions: {
      title: {
        fieldId: 'title',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      artist: {
        fieldId: 'artist',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      album: {
        fieldId: 'album',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      year: {
        fieldId: 'year',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      trackNumber: {
        fieldId: 'trackNumber',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      discNumber: {
        fieldId: 'discNumber',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      },
      genre: {
        fieldId: 'genre',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.95
      }
    },
    fieldAlternatives: {}
  };

  describe('buildTrackPreviewFromMergedResult', () => {
    it('uses remoteTrack recording title when pair is a TrackMatchPair', () => {
      const pair: TrackMatchPair = {
        localSong: {
          songId: 101,
          path: '/music/radiohead/01_airbag.mp3',
          title: 'Airbag (Original)',
          artist: 'Radiohead',
          album: 'OK Computer',
          year: 1997,
          trackNumber: 1,
          discNumber: 1,
          isrc: 'GBAYE9700010',
          musicBrainzRecordingId: 'mb-rec-001'
        },
        remoteTrack: {
          recording: {
            id: 'rec-01',
            title: 'Airbag',
            trackNumber: 1,
            discNumber: 1,
            lengthSeconds: 284
          },
          provider: {
            id: 'rel-01',
            provider: 'musicbrainz',
            title: 'OK Computer'
          }
        },
        confidence: 0.95,
        confidenceLevel: 'High',
        why: 'Exact title and duration match',
        reasons: ['Track 1 match']
      };

      const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(pair, baseMerged);
      const titleDiff = preview.fieldDiffs.find((f) => f.fieldId === 'title');

      expect(titleDiff).toBeDefined();
      expect(titleDiff?.suggestedValue).toBe('Airbag');
      expect(titleDiff?.suggestedValue).not.toBe('OK Computer');
      expect(preview.oldIsrc).toBe('GBAYE9700010');
      expect(preview.oldMbid).toBe('mb-rec-001');
    });

    it('falls back to merged.title when songOrPair is a LocalSongInput', () => {
      const localInput: LocalSongInput = {
        songId: 102,
        path: '/music/radiohead/unknown.mp3',
        title: 'Unknown Title',
        artist: 'Radiohead',
        album: 'OK Computer'
      };

      const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(localInput, baseMerged);
      const titleDiff = preview.fieldDiffs.find((f) => f.fieldId === 'title');

      expect(titleDiff).toBeDefined();
      expect(titleDiff?.suggestedValue).toBe('OK Computer');
    });

    it('falls back to merged.title when pair.remoteTrack is undefined', () => {
      const pairWithoutRemote: Partial<TrackMatchPair> & { localSong: LocalSongInput } = {
        localSong: {
          songId: 103,
          path: '/music/radiohead/unmatched.mp3',
          title: 'Unmatched Local Track',
          artist: 'Radiohead'
        },
        confidence: 0.5,
        reasons: ['Unmatched']
      };

      const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(
        pairWithoutRemote as TrackMatchPair,
        baseMerged
      );
      const titleDiff = preview.fieldDiffs.find((f) => f.fieldId === 'title');

      expect(titleDiff).toBeDefined();
      expect(titleDiff?.suggestedValue).toBe('OK Computer');
    });

    it('never assigns album title as track title across multiple album tracks', () => {
      const tracks = [
        { id: 1, oldTitle: 'Track 1', newTitle: 'Airbag', trackNo: 1 },
        { id: 2, oldTitle: 'Track 2', newTitle: 'Paranoid Android', trackNo: 2 },
        { id: 3, oldTitle: 'Track 3', newTitle: 'Subterranean Homesick Alien', trackNo: 3 }
      ];

      const previews = tracks.map((t) => {
        const pair: TrackMatchPair = {
          localSong: {
            songId: t.id,
            path: `/music/track_${t.id}.mp3`,
            title: t.oldTitle,
            artist: 'Radiohead',
            album: 'OK Computer'
          },
          remoteTrack: {
            recording: {
              id: `rec-${t.id}`,
              title: t.newTitle,
              trackNumber: t.trackNo
            },
            provider: {
              id: 'mb-01',
              provider: 'musicbrainz'
            }
          },
          confidence: 0.95,
          confidenceLevel: 'High',
          why: 'Matched',
          reasons: []
        };
        return MetadataDiffBuilder.buildTrackPreviewFromMergedResult(pair, baseMerged);
      });

      expect(previews[0].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Airbag'
      );
      expect(previews[1].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Paranoid Android'
      );
      expect(previews[2].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Subterranean Homesick Alien'
      );

      previews.forEach((p) => {
        expect(p.fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).not.toBe(
          'OK Computer'
        );
      });
    });
  });
});
