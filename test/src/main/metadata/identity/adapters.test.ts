import { describe, expect, it } from 'vitest';
import {
  toCanonicalFromDiscogs,
  toCanonicalFromMusicBrainz,
  toCanonicalFromSong,
  toCanonicalFromSpotifyTrack
} from '@main/metadata/identity';

describe('Canonical Track Identity Adapters', () => {
  it('should adapt local Nora SongData cleanly', () => {
    const localSong = {
      songId: 101,
      title: 'Bohemian Rhapsody',
      artists: [{ name: 'Queen' }, { name: 'Freddie Mercury' }],
      album: { name: 'A Night at the Opera' },
      duration: 354.3,
      year: 1975,
      trackNo: 11,
      discNumber: 1,
      isrc: 'GBUM71029604',
      musicBrainzRecordingId: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d52350',
      path: '/music/queen/bohemian_rhapsody.flac'
    };

    const canonical = toCanonicalFromSong(localSong);
    expect(canonical.id).toBe(101);
    expect(canonical.title).toBe('Bohemian Rhapsody');
    expect(canonical.artists).toEqual(['Queen', 'Freddie Mercury']);
    expect(canonical.album).toBe('A Night at the Opera');
    expect(canonical.durationSecs).toBe(354.3);
    expect(canonical.isrc).toBe('GBUM71029604');
    expect(canonical.musicBrainzRecordingId).toBe('b10bbbfc-cf9e-42e0-be17-e2c3e1d52350');
    expect(canonical.pathOrUri).toBe('/music/queen/bohemian_rhapsody.flac');
  });

  it('should adapt Spotify Track API DTO cleanly', () => {
    const spotifyTrack = {
      id: 'spotify_track_123',
      name: 'Starboy',
      artists: [{ name: 'The Weeknd' }, { name: 'Daft Punk' }],
      album: {
        name: 'Starboy',
        release_date: '2016-11-25'
      },
      duration_ms: 230453,
      track_number: 1,
      disc_number: 1,
      external_ids: {
        isrc: 'USUG11600854'
      },
      uri: 'spotify:track:spotify_track_123'
    };

    const canonical = toCanonicalFromSpotifyTrack(spotifyTrack);
    expect(canonical.id).toBe('spotify_track_123');
    expect(canonical.title).toBe('Starboy');
    expect(canonical.artists).toEqual(['The Weeknd', 'Daft Punk']);
    expect(canonical.album).toBe('Starboy');
    expect(canonical.releaseYear).toBe(2016);
    expect(canonical.durationSecs).toBe(230.453);
    expect(canonical.isrc).toBe('USUG11600854');
    expect(canonical.pathOrUri).toBe('spotify:track:spotify_track_123');
  });

  it('should adapt MusicBrainz recording response cleanly', () => {
    const mbRecording = {
      id: 'mb_rec_456',
      title: 'Heroes',
      artistCredit: [{ name: 'David Bowie' }],
      releases: [{ title: 'Heroes', date: '1977-10-14' }],
      length: 371000,
      isrcs: ['GBAYE7700030']
    };

    const canonical = toCanonicalFromMusicBrainz(mbRecording);
    expect(canonical.musicBrainzRecordingId).toBe('mb_rec_456');
    expect(canonical.title).toBe('Heroes');
    expect(canonical.artists).toEqual(['David Bowie']);
    expect(canonical.album).toBe('Heroes');
    expect(canonical.releaseYear).toBe(1977);
    expect(canonical.durationSecs).toBe(371);
    expect(canonical.isrc).toBe('GBAYE7700030');
  });

  it('should adapt Discogs track cleanly', () => {
    const discogsTrack = {
      title: 'Space Oddity',
      artists: [{ name: 'David Bowie' }],
      duration: '5:15',
      position: 'A1',
      extraartists: []
    };

    const canonical = toCanonicalFromDiscogs(discogsTrack, {
      title: 'Space Oddity',
      year: 1969
    });
    expect(canonical.title).toBe('Space Oddity');
    expect(canonical.artists).toEqual(['David Bowie']);
    expect(canonical.durationSecs).toBe(315); // 5 * 60 + 15
    expect(canonical.album).toBe('Space Oddity');
    expect(canonical.releaseYear).toBe(1969);
  });
});
