import { TrackIdentityMatcher, type CanonicalTrackIdentity } from '@main/metadata/identity';
import { describe, expect, it } from 'vitest';

describe('TrackIdentityMatcher (Variant Detection & Strict False-Positive Prevention)', () => {
  const baseTrack: CanonicalTrackIdentity = {
    title: 'Hotel California',
    artists: ['Eagles'],
    album: 'Hotel California',
    durationSecs: 390
  };

  it('should strictly reject Studio vs Live version (isMatch = false)', () => {
    const liveTrack: CanonicalTrackIdentity = {
      title: 'Hotel California (Live On MTV)',
      artists: ['Eagles'],
      album: 'Hell Freezes Over',
      durationSecs: 432
    };

    const result = TrackIdentityMatcher.scorePair(baseTrack, liveTrack);
    expect(result.isMatch).toBe(false);
    expect(result.matchType).toBe('NONE');
    expect(result.breakdown.variantPenalty).toBeGreaterThanOrEqual(35);
    expect(result.reasons).toContain('variant_mismatch_live');
  });

  it('should strictly reject Studio vs Acoustic version (isMatch = false)', () => {
    const acousticTrack: CanonicalTrackIdentity = {
      title: 'Hotel California - Acoustic Version',
      artists: ['Eagles'],
      durationSecs: 360
    };

    const result = TrackIdentityMatcher.scorePair(baseTrack, acousticTrack);
    expect(result.isMatch).toBe(false);
    expect(result.matchType).toBe('NONE');
    expect(result.breakdown.variantPenalty).toBeGreaterThanOrEqual(30);
    expect(result.reasons).toContain('variant_mismatch_acoustic');
  });

  it('should strictly reject Studio vs Remix / Club Mix (isMatch = false)', () => {
    const remixTrack: CanonicalTrackIdentity = {
      title: 'Hotel California [Remix 2024]',
      artists: ['Eagles'],
      durationSecs: 310
    };

    const result = TrackIdentityMatcher.scorePair(baseTrack, remixTrack);
    expect(result.isMatch).toBe(false);
    expect(result.matchType).toBe('NONE');
    expect(result.breakdown.variantPenalty).toBeGreaterThanOrEqual(40);
    expect(result.reasons).toContain('variant_mismatch_remix');
  });

  it('should strictly reject Studio vs Instrumental (isMatch = false)', () => {
    const instrumentalTrack: CanonicalTrackIdentity = {
      title: 'Hotel California (Instrumental)',
      artists: ['Eagles'],
      durationSecs: 390
    };

    const result = TrackIdentityMatcher.scorePair(baseTrack, instrumentalTrack);
    expect(result.isMatch).toBe(false);
    expect(result.matchType).toBe('NONE');
    expect(result.breakdown.variantPenalty).toBeGreaterThanOrEqual(45);
    expect(result.reasons).toContain('variant_mismatch_instrumental');
  });

  it('should accept Remastered releases as the same recording (HIGH_CONFIDENCE_METADATA)', () => {
    const remasterTrack: CanonicalTrackIdentity = {
      title: 'Hotel California (2013 Remaster)',
      artists: ['Eagles'],
      album: 'Hotel California',
      durationSecs: 390.4
    };

    const result = TrackIdentityMatcher.scorePair(baseTrack, remasterTrack);
    expect(result.breakdown.variantPenalty).toBe(0);
    expect(result.isMatch).toBe(true);
    expect(result.matchType).toBe('HIGH_CONFIDENCE_METADATA');
  });

  it('should match featuring artist variations cleanly', () => {
    const trackWithFeatInTitle: CanonicalTrackIdentity = {
      title: 'Empire State of Mind (feat. Alicia Keys)',
      artists: ['JAY-Z'],
      durationSecs: 276
    };
    const trackWithFeatInArtists: CanonicalTrackIdentity = {
      title: 'Empire State of Mind',
      artists: ['JAY-Z', 'Alicia Keys'],
      durationSecs: 276.5
    };

    const result = TrackIdentityMatcher.scorePair(trackWithFeatInTitle, trackWithFeatInArtists);
    expect(result.isMatch).toBe(true);
    expect(result.breakdown.variantPenalty).toBe(0);
  });
});
