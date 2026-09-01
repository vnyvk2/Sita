import { MetadataDiffBuilder } from '@main/metadata/diff/MetadataDiffBuilder';
import type { ResourceMutationPayload } from '@main/metadata/domain/MetadataTransaction';
import { MetadataNormalizer } from '@main/metadata/matching/MetadataNormalizer';
import type { MergedCandidateResult } from '@main/metadata/resolution/MetadataMergeEngine';
import { MetadataQueryNormalizer } from '@main/metadata/search/MetadataQueryNormalizer';
import type { TrackMatchPair, LocalSongInput } from '@main/metadata/services/AlbumMetadataService';
import { MetadataTransactionManager } from '@main/metadata/transactions/MetadataTransactionManager';
import { SnapshotBuilder } from '@main/metadata/transactions/SnapshotBuilder';
import { describe, expect, it, vi } from 'vitest';

describe('AutoTag Safety Boundary (Phase 0 Integration Gate)', () => {
  const baseMerged: MergedCandidateResult = {
    title: 'The Dark Side of the Moon',
    artist: 'Pink Floyd',
    album: 'The Dark Side of the Moon',
    year: 1973,
    genre: 'Progressive Rock',
    fieldAttributions: {
      title: {
        fieldId: 'title',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      artist: {
        fieldId: 'artist',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      album: {
        fieldId: 'album',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      year: {
        fieldId: 'year',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      trackNumber: {
        fieldId: 'trackNumber',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      discNumber: {
        fieldId: 'discNumber',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      },
      genre: {
        fieldId: 'genre',
        providerId: 'musicbrainz',
        providerName: 'MusicBrainz',
        confidenceScore: 0.98
      }
    },
    fieldAlternatives: {}
  };

  describe('Invariant I-1: Track Identity Protection', () => {
    it('never overwrites individual track titles with album title during preview construction', () => {
      const albumTracks = [
        {
          songId: 1,
          file: '01_speak_to_me.mp3',
          currentTitle: 'Speak to Me (Live)',
          remoteTitle: 'Speak to Me',
          trackNo: 1
        },
        {
          songId: 2,
          file: '02_breathe.mp3',
          currentTitle: 'Breathe (In the Air)',
          remoteTitle: 'Breathe',
          trackNo: 2
        },
        {
          songId: 3,
          file: '03_on_the_run.mp3',
          currentTitle: 'On the Run (Studio)',
          remoteTitle: 'On the Run',
          trackNo: 3
        },
        {
          songId: 4,
          file: '04_time.mp3',
          currentTitle: 'Time (2011 Remaster)',
          remoteTitle: 'Time',
          trackNo: 4
        }
      ];

      const previews = albumTracks.map((t) => {
        const pair: TrackMatchPair = {
          localSong: {
            songId: t.songId,
            path: `/music/pink_floyd/${t.file}`,
            title: t.currentTitle,
            artist: 'Pink Floyd',
            album: 'The Dark Side of the Moon',
            year: 1973,
            trackNumber: t.trackNo,
            discNumber: 1
          },
          remoteTrack: {
            recording: {
              id: `rec-${t.songId}`,
              title: t.remoteTitle,
              trackNumber: t.trackNo,
              discNumber: 1
            },
            provider: {
              id: 'mb-pf-01',
              provider: 'musicbrainz'
            }
          },
          confidence: 0.96,
          confidenceLevel: 'Excellent',
          why: 'Track match verified',
          reasons: []
        };

        return MetadataDiffBuilder.buildTrackPreviewFromMergedResult(pair, baseMerged);
      });

      // Verify each track preview has its specific recording title, NEVER the album title
      expect(previews[0].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Speak to Me'
      );
      expect(previews[1].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Breathe'
      );
      expect(previews[2].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'On the Run'
      );
      expect(previews[3].fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
        'Time'
      );

      previews.forEach((p) => {
        expect(p.fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).not.toBe(
          'The Dark Side of the Moon'
        );
      });
    });

    it('safely handles LocalSongInput fallback without throwing TypeError', () => {
      const localOnly: LocalSongInput = {
        songId: 999,
        path: '/music/misc/track.mp3',
        title: 'Unknown Track',
        artist: 'Unknown Artist'
      };

      expect(() => {
        const preview = MetadataDiffBuilder.buildTrackPreviewFromMergedResult(
          localOnly,
          baseMerged
        );
        expect(preview.fieldDiffs.find((f) => f.fieldId === 'title')?.suggestedValue).toBe(
          'The Dark Side of the Moon'
        );
      }).not.toThrow();
    });
  });

  describe('Invariant I-2 & I-3: Unicode Preservation & Empty Normalization Invariant', () => {
    it('preserves non-Latin scripts across CJK, Cyrillic, and Arabic libraries', () => {
      // CJK
      expect(MetadataNormalizer.normalizeTitle('夜に駆ける')).toBe('夜に駆ける');
      expect(MetadataNormalizer.normalizeArtist('YOASOBI')).toBe('yoasobi');
      expect(MetadataNormalizer.normalizeAlbum('THE BOOK')).toBe('the book');

      // Cyrillic
      expect(MetadataNormalizer.normalizeTitle('Группа крови')).toBe('группа крови');
      expect(MetadataNormalizer.normalizeArtist('Кино')).toBe('кино');

      // Arabic
      expect(MetadataNormalizer.normalizeTitle('أغنية جميلة')).toBe('أغنية جميلة');
    });

    it('normalizes tokens with whitespace replacement to preserve token boundaries (e.g. AC/DC)', () => {
      expect(MetadataNormalizer.normalizeArtist('AC/DC')).toBe('ac dc');
      expect(MetadataNormalizer.normalizeArtist('A.R. Rahman')).toBe('ar rahman');
      expect(MetadataNormalizer.normalizeTitle('Rock & Roll')).toBe('rock roll');
    });

    it('produces identical normalized output for composed (NFC) and decomposed (NFD) Unicode representations', () => {
      const composed = 'Café';
      const decomposed = 'Cafe\u0301';
      expect(MetadataNormalizer.normalizeTitle(composed)).toBe(
        MetadataNormalizer.normalizeTitle(decomposed)
      );
      expect(MetadataNormalizer.normalizeTitle(composed)).toBe('cafe');

      const cjkComposed = '夜に駆ける'.normalize('NFC');
      const cjkDecomposed = '夜に駆ける'.normalize('NFD');
      expect(MetadataNormalizer.normalizeTitle(cjkComposed)).toBe(
        MetadataNormalizer.normalizeTitle(cjkDecomposed)
      );
    });

    it('returns empty string for inputs with only symbols/emojis and treats empty normalized values as 0 match points', () => {
      const normEmpty = MetadataNormalizer.normalizeTitle('🎵🔥✨');
      expect(normEmpty).toBe('');

      // Empty string should never yield a positive similarity match
      const simScore = MetadataQueryNormalizer.compareStringSimilarity('🎵🔥✨', '夜に駆ける');
      expect(simScore).toBe(0);
    });
  });

  describe('Invariant I-7: Rollback Completeness Across All 7 Mutable Fields', () => {
    it('records and restores all 7 metadata fields accurately on transaction rollback', async () => {
      let restoredPayload: Record<string, string | number | undefined> | null = null;
      const mockDbUpdater = vi
        .fn()
        .mockImplementation(
          async (_songId: number, tags: Record<string, string | number | undefined>) => {
            restoredPayload = tags;
            return { success: true };
          }
        );

      const txManager = new MetadataTransactionManager({
        dbUpdater: mockDbUpdater
      });

      const mutations: ResourceMutationPayload[] = [
        {
          resourceId: 501,
          filePath: '/music/radiohead/airbag.mp3',
          fieldMutations: [
            { fieldId: 'title', oldValue: 'Airbag (Demo)', newValue: 'Airbag' },
            { fieldId: 'artist', oldValue: 'Radiohead UK', newValue: 'Radiohead' },
            { fieldId: 'album', oldValue: 'OK Computer (1997)', newValue: 'OK Computer' },
            { fieldId: 'year', oldValue: 1996, newValue: 1997 },
            { fieldId: 'trackNumber', oldValue: 1, newValue: 1 },
            { fieldId: 'discNumber', oldValue: 1, newValue: 1 },
            { fieldId: 'genre', oldValue: 'Art Rock', newValue: 'Alternative Rock' }
          ]
        }
      ];

      const applyRes = await txManager.executeTransaction('op-test-full-rollback', mutations);
      expect(applyRes.success).toBe(true);
      expect(txManager.history.canUndo).toBe(true);

      const rollbackRes = await txManager.rollbackLastTransaction();
      expect(rollbackRes.success).toBe(true);
      expect(rollbackRes.revertedCount).toBe(1);

      // Verify all 7 pre-AutoTag values are accurately passed to dbUpdater.
      // Contract note: identity fields use explicit-clear semantics ('' =
      // clear) so absent originals genuinely erase AutoTag-injected values;
      // the sync envelope may carry additional always-present transport keys
      // (style/artworkPath) that stay undefined here.
      expect(restoredPayload).toMatchObject({
        title: 'Airbag (Demo)',
        artist: 'Radiohead UK',
        album: 'OK Computer (1997)',
        year: 1996,
        trackNumber: 1,
        discNumber: 1,
        genre: 'Art Rock',
        isrc: '',
        musicBrainzRecordingId: ''
      });
    });
  });

  describe('Invariant I-5: Write Consistency & Deferred Awareness', () => {
    it('accurately tracks deferred writes for currently-playing songs without throwing errors', async () => {
      const mockDeferredUpdater = vi.fn().mockImplementation(async () => {
        // Simulates updateSongId3Tags queueing the write due to open OS playback handle
        return { success: true, deferred: true };
      });

      const txManager = new MetadataTransactionManager({
        dbUpdater: mockDeferredUpdater
      });

      const mutations: ResourceMutationPayload[] = [
        {
          resourceId: 777,
          filePath: '/music/currently_playing.mp3',
          fieldMutations: [{ fieldId: 'title', oldValue: 'Track', newValue: 'Track (AutoTagged)' }]
        }
      ];

      const result = await txManager.executeTransaction('op-playing-song', mutations);
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(1);
      expect(result.deferredCount).toBe(1);
    });
  });
});
