import { describe, expect, it } from 'vitest';
import { TrackMatcher } from '../TrackMatcher';

describe('TrackMatcher — Object Album Input Support', () => {
  it('correctly extracts string album name from object song.album without throwing TypeError', () => {
    const matcher = new TrackMatcher();
    const song = {
      songId: 101,
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      album: { albumId: 12, name: 'SOUR' } as any,
      path: '/music/brutal.mp3'
    };

    const track = {
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      trackNumber: 1
    };

    const result = matcher.scorePair(song, track);
    expect(result.score).toBeGreaterThan(50);
    expect(result.reasons).toContain('exact_album_match');
  });
});
