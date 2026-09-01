import { TrackMatcher, MIN_MATCH_SCORE } from '@main/metadata/matching/TrackMatcher';
import type { LocalSongInput, OfficialTrackInput } from '@main/metadata/matching/TrackMatcher';
import { describe, expect, it } from 'vitest';

describe('TrackMatcher (Phase 1 Matching Invariants)', () => {
  const matcher = new TrackMatcher();

  describe('Invariant I-3: Empty String 0-Score Rule', () => {
    it('scores 0 title points when song title or track title normalizes to empty string', () => {
      const localSong: LocalSongInput = {
        songId: 1,
        title: '🎵🔥✨',
        path: '/music/emoji.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-01',
        title: 'Real Song Title',
        trackNumber: 1
      };

      const score = matcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.title).toBe(0);
      expect(score.score).toBeLessThan(MIN_MATCH_SCORE);
    });

    it('scores 0 artist points when artist normalizes to empty string', () => {
      const localSong: LocalSongInput = {
        songId: 2,
        title: 'Valid Title',
        artist: '---...---',
        path: '/music/track.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-02',
        title: 'Valid Title',
        artist: 'Valid Artist',
        trackNumber: 1
      };

      const score = matcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.artist).toBe(0);
    });
  });

  describe('BUG-12: Bidirectional Artist Matching', () => {
    it('matches when remote artist contains local artist (local: Queen, remote: Queen feat. David Bowie)', () => {
      const localSong: LocalSongInput = {
        songId: 10,
        title: 'Under Pressure',
        artist: 'Queen',
        path: '/music/queen/under_pressure.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-10',
        title: 'Under Pressure',
        artist: 'Queen feat. David Bowie',
        trackNumber: 1
      };

      const score = matcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.artist).toBe(20);
      expect(score.matchedBy).toContain('artist');
      expect(score.reasons).toContain('artist_match');
    });

    it('matches when local artist contains remote artist (local: Queen & David Bowie, remote: Queen)', () => {
      const localSong: LocalSongInput = {
        songId: 11,
        title: 'Under Pressure',
        artist: 'Queen with David Bowie',
        path: '/music/queen/under_pressure.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-11',
        title: 'Under Pressure',
        artist: 'Queen',
        trackNumber: 1
      };

      const score = matcher.scorePair(localSong, officialTrack);
      expect(score.breakdown.artist).toBe(20);
      expect(score.matchedBy).toContain('artist');
      expect(score.reasons).toContain('artist_match');
    });
  });

  describe('BUG-14: Conflicting Variant Hard Score Ceiling', () => {
    it('enforces a hard score ceiling below MIN_MATCH_SCORE (50) for conflicting variants', () => {
      // Local is "Live", remote is "Acoustic"
      // Even with exact title, artist, album, year, and duration matches (total ~115 pts before penalty)
      const localSong: LocalSongInput = {
        songId: 20,
        title: 'Hotel California (Live)',
        artist: 'Eagles',
        album: 'Hell Freezes Over',
        year: 1994,
        duration: 432,
        path: '/music/eagles/hotel_california_live.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-20',
        title: 'Hotel California (Acoustic)',
        artist: 'Eagles',
        album: 'Hell Freezes Over',
        year: 1994,
        duration: 432,
        trackNumber: 1
      };

      const scoreResult = matcher.scorePair(localSong, officialTrack);

      // Score must be strictly less than MIN_MATCH_SCORE (50)
      expect(scoreResult.score).toBeLessThan(MIN_MATCH_SCORE);
      expect(scoreResult.score).toBeLessThanOrEqual(49);
      expect(scoreResult.reasons).toContain('conflicting_variants_ceiling_applied');

      // When matchTracks runs, this pair MUST be excluded from assigned pairs
      const matchedPairs = matcher.matchTracks([localSong], 'rel-01', [officialTrack]);
      expect(matchedPairs).toHaveLength(0);
    });

    it('allows matching when variants are identical or compatible (Live vs Live)', () => {
      const localSong: LocalSongInput = {
        songId: 21,
        title: 'Hotel California (Live)',
        artist: 'Eagles',
        album: 'Hell Freezes Over',
        year: 1994,
        duration: 432,
        path: '/music/eagles/hotel_california_live.mp3'
      };
      const officialTrack: OfficialTrackInput = {
        trackId: 'rec-21',
        title: 'Hotel California (Live)',
        artist: 'Eagles',
        album: 'Hell Freezes Over',
        year: 1994,
        duration: 432,
        trackNumber: 1
      };

      const scoreResult = matcher.scorePair(localSong, officialTrack);
      expect(scoreResult.score).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
      expect(scoreResult.reasons).not.toContain('conflicting_variants_ceiling_applied');

      const matchedPairs = matcher.matchTracks([localSong], 'rel-01', [officialTrack]);
      expect(matchedPairs).toHaveLength(1);
      expect(matchedPairs[0].localSong.songId).toBe(21);
    });
  });
});
