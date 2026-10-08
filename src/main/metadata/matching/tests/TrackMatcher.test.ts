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

describe('TrackMatcher — DEF-TAG-04 multi-disc track key collision', () => {
  it('matches same track numbers across different discs when providers omit trackIds', () => {
    const matcher = new TrackMatcher();
    const localSongs = [
      {
        songId: 1,
        title: 'Disc One Opener',
        artist: 'Test Artist',
        album: 'Double Album',
        path: '/music/d1t1.mp3',
        discNumber: 1,
        trackNumber: 1
      },
      {
        songId: 2,
        title: 'Disc Two Opener',
        artist: 'Test Artist',
        album: 'Double Album',
        path: '/music/d2t1.mp3',
        discNumber: 2,
        trackNumber: 1
      }
    ];
    // Providers such as Discogs resolve without synthetic trackIds: both official
    // tracks share trackNumber 1 and are distinguished only by discNumber.
    const officialTracks = [
      { title: 'Disc One Opener', artist: 'Test Artist', trackNumber: 1, discNumber: 1 },
      { title: 'Disc Two Opener', artist: 'Test Artist', trackNumber: 1, discNumber: 2 }
    ];

    const pairs = matcher.matchTracks(localSongs, 'rel-1', officialTracks, {
      albumTitle: 'Double Album'
    });

    expect(pairs).toHaveLength(2);
    expect(pairs.map((p) => p.localSong.songId).sort()).toEqual([1, 2]);
  });
});
