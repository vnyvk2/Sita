import { describe, expect, it } from 'vitest';

import type { CanonicalTrackIdentity } from '../../../../../src/main/metadata/identity/CanonicalTrackIdentity';
import { TrackIdentityMatcher } from '../../../../../src/main/metadata/identity/TrackIdentityMatcher';

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

  describe('Targeted Candidate Indexing & Matching Regressions', () => {
    it('1. Same title, different artists: does not match', () => {
      const candidateA: CanonicalTrackIdentity = {
        title: 'Hello',
        artists: ['Adele'],
        durationSecs: 295
      };
      const remoteB: CanonicalTrackIdentity = {
        title: 'Hello',
        artists: ['Lionel Richie'],
        durationSecs: 250
      };

      const score = TrackIdentityMatcher.scorePair(candidateA, remoteB);
      expect(score.isMatch).toBe(false);
      expect(score.matchType).toBe('NONE');
    });

    it('2. Same title, same artist, different albums: matches with high confidence', () => {
      const candidateA: CanonicalTrackIdentity = {
        title: 'Dreams',
        artists: ['Fleetwood Mac'],
        album: 'Rumours',
        durationSecs: 257
      };
      const remoteB: CanonicalTrackIdentity = {
        title: 'Dreams',
        artists: ['Fleetwood Mac'],
        album: 'Greatest Hits',
        durationSecs: 257
      };

      const score = TrackIdentityMatcher.scorePair(candidateA, remoteB);
      expect(score.isMatch).toBe(true);
      expect(score.score).toBeGreaterThanOrEqual(85);
    });

    it('3. ISRC match vs competing title candidate: ISRC candidate is authoritative', () => {
      const isrcCandidate: CanonicalTrackIdentity = {
        id: 101,
        title: 'Song Title (Radio Edit)',
        artists: ['Artist Name'],
        isrc: 'GBAYE0601477'
      };
      const titleCandidate: CanonicalTrackIdentity = {
        id: 102,
        title: 'Song Title',
        artists: ['Different Artist']
      };
      const remoteTrack: CanonicalTrackIdentity = {
        title: 'Song Title',
        artists: ['Artist Name'],
        isrc: 'GBAYE0601477'
      };

      const isrcScore = TrackIdentityMatcher.scorePair(isrcCandidate, remoteTrack);
      const titleScore = TrackIdentityMatcher.scorePair(titleCandidate, remoteTrack);

      expect(isrcScore.isAuthoritative).toBe(true);
      expect(isrcScore.score).toBe(100);
      expect(titleScore.isMatch).toBe(false);
      expect(isrcScore.score).toBeGreaterThan(titleScore.score);
    });

    it('4. Multiple local versions of same track: prefers exact version over live recording', () => {
      const studioCandidate: CanonicalTrackIdentity = {
        id: 1,
        title: 'Comfortably Numb',
        artists: ['Pink Floyd'],
        album: 'The Wall',
        durationSecs: 382
      };
      const liveCandidate: CanonicalTrackIdentity = {
        id: 2,
        title: 'Comfortably Numb (Live)',
        artists: ['Pink Floyd'],
        album: 'Pulse',
        durationSecs: 570
      };
      const targetRemote: CanonicalTrackIdentity = {
        title: 'Comfortably Numb',
        artists: ['Pink Floyd'],
        album: 'The Wall',
        durationSecs: 382
      };

      const studioScore = TrackIdentityMatcher.scorePair(studioCandidate, targetRemote);
      const liveScore = TrackIdentityMatcher.scorePair(liveCandidate, targetRemote);

      expect(studioScore.score).toBeGreaterThan(liveScore.score);
    });

    it('5. Common / generic titles ("Intro", "Hold On"): requires matching artist and duration', () => {
      const candidateIntro: CanonicalTrackIdentity = {
        title: 'Intro',
        artists: ['The xx'],
        durationSecs: 127
      };
      const remoteIntroOther: CanonicalTrackIdentity = {
        title: 'Intro',
        artists: ['M83'],
        durationSecs: 322
      };

      const score = TrackIdentityMatcher.scorePair(candidateIntro, remoteIntroOther);
      expect(score.isMatch).toBe(false);
    });
  });

  describe('Bidirectional Semantic Symmetry (scorePair(a, b) === scorePair(b, a))', () => {
    function assertSymmetric(a: CanonicalTrackIdentity, b: CanonicalTrackIdentity) {
      const resAB = TrackIdentityMatcher.scorePair(a, b);
      const resBA = TrackIdentityMatcher.scorePair(b, a);

      expect(resAB.score).toBe(resBA.score);
      expect(resAB.confidence).toBe(resBA.confidence);
      expect(resAB.matchType).toBe(resBA.matchType);
      expect(resAB.isMatch).toBe(resBA.isMatch);
      expect(resAB.isAuthoritative).toBe(resBA.isAuthoritative);
      expect(resAB.breakdown.title).toBe(resBA.breakdown.title);
      expect(resAB.breakdown.artist).toBe(resBA.breakdown.artist);
      expect(resAB.breakdown.album).toBe(resBA.breakdown.album);
      expect(resAB.breakdown.year).toBe(resBA.breakdown.year);
      expect(resAB.breakdown.duration).toBe(resBA.breakdown.duration);
      expect(resAB.breakdown.isrcOrMbid).toBe(resBA.breakdown.isrcOrMbid);
      expect(resAB.breakdown.variantPenalty).toBe(resBA.breakdown.variantPenalty);
      expect(resAB.breakdown.total).toBe(resBA.breakdown.total);
    }

    it('should be perfectly symmetric for MBID matches', () => {
      assertSymmetric(
        { title: 'Song A', artists: ['Artist A'], musicBrainzRecordingId: 'mbid-123' },
        { title: 'Song B', artists: ['Artist B'], musicBrainzRecordingId: 'mbid-123' }
      );
    });

    it('should be perfectly symmetric for ISRC matches', () => {
      assertSymmetric(
        { title: 'Song A', artists: ['Artist A'], isrc: 'GBAYE0601477' },
        { title: 'Song B', artists: ['Artist B'], isrc: 'GBAYE0601477' }
      );
    });

    it('should be perfectly symmetric for High Confidence metadata matches', () => {
      assertSymmetric(
        {
          title: 'Bohemian Rhapsody',
          artists: ['Queen'],
          album: 'A Night at the Opera',
          releaseYear: 1975,
          durationSecs: 354
        },
        {
          title: 'Bohemian Rhapsody',
          artists: ['Queen'],
          album: 'A Night at the Opera',
          releaseYear: 1975,
          durationSecs: 354
        }
      );
    });

    it('should be perfectly symmetric for Variant Mismatches (Live vs Studio)', () => {
      assertSymmetric(
        { title: 'Hotel California (Live)', artists: ['Eagles'], durationSecs: 420 },
        { title: 'Hotel California', artists: ['Eagles'], durationSecs: 390 }
      );
    });

    it('should be perfectly symmetric for Partial / Fuzzy matches', () => {
      assertSymmetric(
        { title: 'Super Massive Black Hole', artists: ['Muse'], durationSecs: 209 },
        { title: 'Supermassive Black Hole', artists: ['Muse'], durationSecs: 210 }
      );
    });

    it('should be perfectly symmetric for completely unrelated tracks', () => {
      assertSymmetric(
        { title: 'Track X', artists: ['Artist X'], durationSecs: 180 },
        { title: 'Track Y', artists: ['Artist Y'], durationSecs: 240 }
      );
    });
  });
});
