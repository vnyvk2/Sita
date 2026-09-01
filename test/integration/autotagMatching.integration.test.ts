import { MetadataMatcher } from '@main/metadata/matching/MetadataMatcher';
import { MetadataNormalizer } from '@main/metadata/matching/MetadataNormalizer';
import { normalizeForMatching } from '@main/metadata/matching/normalizeForMatching';
import { TrackMatcher, MIN_MATCH_SCORE } from '@main/metadata/matching/TrackMatcher';
import type { LocalSongInput, OfficialTrackInput } from '@main/metadata/matching/TrackMatcher';
import { MetadataQueryNormalizer } from '@main/metadata/search/MetadataQueryNormalizer';
import { describe, expect, it } from 'vitest';

describe('AutoTag Matching Subsystem (Phase 1 Integration Gate)', () => {
  const trackMatcher = new TrackMatcher();
  const metadataMatcher = new MetadataMatcher();

  describe('Contract 1: Canonical Normalization Contract Across Layers', () => {
    it('produces expected canonical outputs for international scripts and preserves Unicode characters', () => {
      // Direct canonical normalizer assertions
      expect(normalizeForMatching('夜に駆ける')).toBe('夜に駆ける');
      expect(normalizeForMatching('Кино')).toBe('кино');
      expect(normalizeForMatching('Группа крови')).toBe('группа крови');
      expect(normalizeForMatching('أغنية جميلة')).toBe('أغنية جميلة');
      expect(normalizeForMatching('Café del Mar')).toBe('cafe del mar');
      expect(normalizeForMatching('AC/DC')).toBe('ac dc');
      expect(normalizeForMatching('Simon & Garfunkel')).toBe('simon garfunkel');

      // Composed vs Decomposed Unicode invariant
      const composed = 'Café';
      const decomposed = 'Cafe\u0301';
      expect(normalizeForMatching(composed)).toBe('cafe');
      expect(normalizeForMatching(decomposed)).toBe('cafe');

      const cjkComposed = '夜に駆ける'.normalize('NFC');
      const cjkDecomposed = '夜に駆ける'.normalize('NFD');
      expect(normalizeForMatching(cjkComposed)).toBe(normalizeForMatching(cjkDecomposed));

      // Domain-specific normalizer transformations
      expect(MetadataNormalizer.normalizeTitle('Кино - Группа крови [Live]')).toBe(
        'кино группа крови'
      );
      expect(MetadataNormalizer.normalizeTitle('YOASOBI - 夜に駆ける (Official Music Video)')).toBe(
        'yoasobi 夜に駆ける'
      );
      expect(MetadataNormalizer.normalizeArtist('A.R. Rahman with Sid Sriram')).toBe(
        'ar rahman sid sriram'
      );
      expect(MetadataNormalizer.normalizeArtist('YOASOBI feat. 初音ミク')).toBe('yoasobi 初音ミク');
    });

    it('enforces empty string invariant across all matching layers for symbol/emoji inputs', () => {
      const emojiInput = '🎵🔥✨';
      const symbolInput = '---...---';

      expect(normalizeForMatching(emojiInput)).toBe('');
      expect(normalizeForMatching(symbolInput)).toBe('');
      expect(MetadataNormalizer.normalizeTitle(emojiInput)).toBe('');
      expect(MetadataNormalizer.normalizeArtist(emojiInput)).toBe('');

      // Similarity score must be strictly 0
      expect(MetadataQueryNormalizer.compareStringSimilarity(emojiInput, 'Valid Song')).toBe(0);

      // MetadataMatcher scoring must yield 0 score for empty normalized inputs
      const matchResult = metadataMatcher.scoreCandidate(
        { title: emojiInput },
        { id: 'c-01', title: 'Valid Song' }
      );
      expect(matchResult.score).toBe(0);
    });
  });

  describe('Contract 2: BUG-12 Bidirectional Artist Matching', () => {
    it('scores full artist match when remote artist is a collaboration including local artist', () => {
      const localSong: LocalSongInput = {
        songId: 101,
        title: 'Starman',
        artist: 'David Bowie',
        path: '/music/bowie/starman.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-bowie-01',
        title: 'Starman',
        artist: 'David Bowie feat. The Spiders from Mars',
        trackNumber: 1
      };

      const score = trackMatcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.artist).toBe(20);
      expect(score.matchedBy).toContain('artist');
    });

    it('scores full artist match when local artist contains featuring tag absent in official release', () => {
      const localSong: LocalSongInput = {
        songId: 102,
        title: 'Get Lucky',
        artist: 'Daft Punk feat. Pharrell Williams',
        path: '/music/daft_punk/get_lucky.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-dp-01',
        title: 'Get Lucky',
        artist: 'Daft Punk',
        trackNumber: 8
      };

      const score = trackMatcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.artist).toBe(20);
      expect(score.matchedBy).toContain('artist');
    });
  });

  describe('Contract 3: BUG-14 Conflicting Variant Hard Score Ceiling', () => {
    it('disqualifies conflicting variants by capping final score below MIN_MATCH_SCORE', () => {
      const localSong: LocalSongInput = {
        songId: 201,
        title: 'Creep (Acoustic Version)',
        artist: 'Radiohead',
        album: 'My Iron Lung',
        year: 1994,
        duration: 259,
        path: '/music/radiohead/creep_acoustic.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-creep-live',
        title: 'Creep (Live in Paris)',
        artist: 'Radiohead',
        album: 'My Iron Lung',
        year: 1994,
        duration: 259,
        trackNumber: 3
      };

      const score = trackMatcher.scorePair(localSong, officialTrack);
      expect(score.score).toBeLessThan(MIN_MATCH_SCORE);
      expect(score.score).toBeLessThanOrEqual(49);
      expect(score.reasons).toContain('conflicting_variants_ceiling_applied');

      const matchedPairs = trackMatcher.matchTracks([localSong], 'rel-radiohead-01', [
        officialTrack
      ]);
      expect(matchedPairs).toHaveLength(0);
    });

    it('allows identical variants to match with high confidence', () => {
      const localSong: LocalSongInput = {
        songId: 202,
        title: 'Creep (Live)',
        artist: 'Radiohead',
        album: 'My Iron Lung',
        year: 1994,
        duration: 259,
        path: '/music/radiohead/creep_live.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-creep-live',
        title: 'Creep (Live)',
        artist: 'Radiohead',
        album: 'My Iron Lung',
        year: 1994,
        duration: 259,
        trackNumber: 3
      };

      const score = trackMatcher.scorePair(localSong, officialTrack);
      expect(score.score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
      expect(score.reasons).not.toContain('conflicting_variants_ceiling_applied');

      const matchedPairs = trackMatcher.matchTracks([localSong], 'rel-radiohead-01', [
        officialTrack
      ]);
      expect(matchedPairs).toHaveLength(1);
      expect(matchedPairs[0].localSong.songId).toBe(202);
    });
  });
});
