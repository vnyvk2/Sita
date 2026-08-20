import { describe, expect, it } from 'vitest';
import {
  TrackIdentityMatcher,
  type CanonicalTrackIdentity
} from '@main/metadata/identity';

describe('TrackIdentityMatcher', () => {
  describe('Authoritative Matching', () => {
    it('should match 100% on exact ISRC regardless of title differences', () => {
      const source: CanonicalTrackIdentity = {
        title: 'Random Local Title',
        artists: ['Unknown Artist'],
        isrc: 'USRC17607839'
      };
      const target: CanonicalTrackIdentity = {
        title: 'Bohemian Rhapsody (2011 Remaster)',
        artists: ['Queen'],
        isrc: 'USRC17607839'
      };

      const result = TrackIdentityMatcher.scorePair(source, target);
      expect(result.isMatch).toBe(true);
      expect(result.score).toBe(100);
      expect(result.confidence).toBe(1.0);
      expect(result.matchType).toBe('ISRC');
      expect(result.isAuthoritative).toBe(true);
      expect(result.reasons).toContain('isrc_exact_match');
    });

    it('should match 100% on exact MusicBrainz Recording ID', () => {
      const source: CanonicalTrackIdentity = {
        title: 'Track A',
        artists: ['Artist A'],
        musicBrainzRecordingId: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d52350'
      };
      const target: CanonicalTrackIdentity = {
        title: 'Track B',
        artists: ['Artist B'],
        musicBrainzRecordingId: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d52350'
      };

      const result = TrackIdentityMatcher.scorePair(source, target);
      expect(result.isMatch).toBe(true);
      expect(result.score).toBe(100);
      expect(result.matchType).toBe('MBID');
      expect(result.isAuthoritative).toBe(true);
      expect(result.reasons).toContain('mbid_exact_match');
    });
  });

  describe('Heuristic Matching', () => {
    it('should match high confidence for identical title, artist, album, and duration', () => {
      const source: CanonicalTrackIdentity = {
        title: 'Hotel California',
        artists: ['Eagles'],
        album: 'Hotel California',
        durationSecs: 390.5,
        releaseYear: 1976
      };
      const target: CanonicalTrackIdentity = {
        title: 'Hotel California',
        artists: ['Eagles'],
        album: 'Hotel California',
        durationSecs: 390.8,
        releaseYear: 1976
      };

      const result = TrackIdentityMatcher.scorePair(source, target);
      expect(result.isMatch).toBe(true);
      expect(result.score).toBe(100);
      expect(result.matchType).toBe('HIGH_CONFIDENCE_METADATA');
      expect(result.isAuthoritative).toBe(false);
      expect(result.breakdown.title).toBe(35);
      expect(result.breakdown.artist).toBe(25);
      expect(result.breakdown.album).toBe(10);
      expect(result.breakdown.year).toBe(5);
      expect(result.breakdown.duration).toBe(30);
    });

    it('should penalize variant mismatches (e.g. Studio vs Live)', () => {
      const studioTrack: CanonicalTrackIdentity = {
        title: 'Hotel California',
        artists: ['Eagles'],
        album: 'Hotel California',
        durationSecs: 390
      };
      const liveTrack: CanonicalTrackIdentity = {
        title: 'Hotel California (Live at the Forum)',
        artists: ['Eagles'],
        album: 'Live at the Forum',
        durationSecs: 420
      };

      const result = TrackIdentityMatcher.scorePair(studioTrack, liveTrack);
      expect(result.breakdown.variantPenalty).toBeGreaterThan(0);
      expect(result.reasons).toContain('variant_mismatch_live');
    });

    it('should fallback to filename for useless title placeholders', () => {
      const sourceWithPlaceholder: CanonicalTrackIdentity = {
        title: 'Track 01',
        artists: ['Queen'],
        pathOrUri: '/music/queen/Bohemian Rhapsody.mp3',
        durationSecs: 354
      };
      const targetTrack: CanonicalTrackIdentity = {
        title: 'Bohemian Rhapsody',
        artists: ['Queen'],
        durationSecs: 354
      };

      const result = TrackIdentityMatcher.scorePair(sourceWithPlaceholder, targetTrack);
      expect(result.isMatch).toBe(true);
      expect(result.breakdown.title).toBe(35);
    });

    it('should reject completely different tracks', () => {
      const trackA: CanonicalTrackIdentity = {
        title: 'Shape of You',
        artists: ['Ed Sheeran'],
        durationSecs: 233
      };
      const trackB: CanonicalTrackIdentity = {
        title: 'Smells Like Teen Spirit',
        artists: ['Nirvana'],
        durationSecs: 301
      };

      const result = TrackIdentityMatcher.scorePair(trackA, trackB);
      expect(result.isMatch).toBe(false);
      expect(result.score).toBeLessThan(50);
      expect(result.matchType).toBe('NONE');
    });

    it('should reject common ambiguous titles with different artists (e.g. "Home", "Stay", "One")', () => {
      const trackHomeA: CanonicalTrackIdentity = {
        title: 'Home',
        artists: ['Michael Bublé'],
        durationSecs: 225
      };
      const trackHomeB: CanonicalTrackIdentity = {
        title: 'Home',
        artists: ['Edward Sharpe & The Magnetic Zeros'],
        durationSecs: 303
      };

      const resultHome = TrackIdentityMatcher.scorePair(trackHomeA, trackHomeB);
      expect(resultHome.isMatch).toBe(false);
      expect(resultHome.score).toBeLessThan(50);
      expect(resultHome.matchType).toBe('NONE');

      const trackStayA: CanonicalTrackIdentity = {
        title: 'Stay',
        artists: ['The Kid LAROI', 'Justin Bieber'],
        durationSecs: 141
      };
      const trackStayB: CanonicalTrackIdentity = {
        title: 'Stay',
        artists: ['Rihanna', 'Mikky Ekko'],
        durationSecs: 240
      };

      const resultStay = TrackIdentityMatcher.scorePair(trackStayA, trackStayB);
      expect(resultStay.isMatch).toBe(false);
      expect(resultStay.score).toBeLessThan(50);
      expect(resultStay.matchType).toBe('NONE');
    });

    it('should handle malformed / empty metadata inputs without throwing errors', () => {
      const emptyTrack: CanonicalTrackIdentity = {
        title: '',
        artists: []
      };
      const validTrack: CanonicalTrackIdentity = {
        title: 'Imagine',
        artists: ['John Lennon']
      };

      expect(() => TrackIdentityMatcher.scorePair(emptyTrack, validTrack)).not.toThrow();
      const result = TrackIdentityMatcher.scorePair(emptyTrack, validTrack);
      expect(result.isMatch).toBe(false);
    });
  });
});
