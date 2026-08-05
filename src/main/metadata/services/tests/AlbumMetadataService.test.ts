import { describe, expect, it } from 'vitest';
import { MetadataNormalizer } from '../../matching/MetadataNormalizer';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 Complete — Production-Grade Metadata Normalizer & Matcher Suite', () => {
  it('normalizes filenames stripping quality tags, audio extensions, and track number prefixes', () => {
    expect(MetadataNormalizer.normalizeFilename('01 - Song.mp3')).toBe('song');
    expect(MetadataNormalizer.normalizeFilename('CD2-07-Song.flac')).toBe('song');
    expect(MetadataNormalizer.normalizeFilename('Track_08_Song.m4a')).toBe('song');
    expect(MetadataNormalizer.normalizeFilename('Song [Official Audio].mp3')).toBe('song');
    expect(MetadataNormalizer.normalizeFilename('Song (Remastered 2011).flac')).toBe('song');
  });

  it('normalizes smart quotes, apostrophes, and abbreviation expansions', () => {
    expect(MetadataNormalizer.normalizeTitle("Don't Stop")).toBe('dont stop');
    expect(MetadataNormalizer.normalizeTitle('It’s My Life')).toBe('its my life');
    expect(MetadataNormalizer.normalizeTitle('Part 1')).toBe('part 1');
    expect(MetadataNormalizer.normalizeTitle('Vol. 2')).toBe('volume 2');
  });

  it('normalizes expanded artist joiners (vs, and, +, x, ×, feat, ft, with)', () => {
    expect(MetadataNormalizer.normalizeArtist('Artist A vs. Artist B')).toBe('artist a artist b');
    expect(MetadataNormalizer.normalizeArtist('Artist A & Artist B')).toBe('artist a artist b');
    expect(MetadataNormalizer.normalizeArtist('Artist A + Artist B')).toBe('artist a artist b');
    expect(MetadataNormalizer.normalizeArtist('Artist A x Artist B')).toBe('artist a artist b');
    expect(MetadataNormalizer.normalizeArtist('Artist A, Artist B')).toBe('artist a artist b');
  });

  it('applies symmetric variant mismatch penalties in both directions', () => {
    const matcher = new TrackMatcher();
    const liveSong = { songId: 1, title: 'Song (Live)', artist: 'Artist', path: '/a.mp3', duration: 200 };
    const studioSong = { songId: 2, title: 'Song', artist: 'Artist', path: '/b.mp3', duration: 200 };
    const liveTrack = { trackId: 't1', title: 'Song (Live)', artist: 'Artist', trackNumber: 1, duration: 200 };
    const studioTrack = { trackId: 't2', title: 'Song', artist: 'Artist', trackNumber: 2, duration: 200 };

    // 1. Song (Live) vs Track (Live) -> NO penalty (100 pts)
    const score1 = matcher.scorePair(liveSong, liveTrack).score;
    expect(score1).toBe(100);

    // 2. Song (Live) vs Track (Studio) -> Penalty (-30 => 70 pts)
    const score2 = matcher.scorePair(liveSong, studioTrack).score;
    expect(score2).toBe(70);

    // 3. Song (Studio) vs Track (Live) -> Penalty (-30 => 70 pts)
    const score3 = matcher.scorePair(studioSong, liveTrack).score;
    expect(score3).toBe(70);
  });

  it('scores ISRC match at 100 points confidence (same as MBID)', () => {
    const matcher = new TrackMatcher();
    const song = { songId: 1, title: 'Unknown', artist: 'Unknown', path: '/a.mp3', isrc: 'USUG12100860' };
    const track = { trackId: 't1', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 1, isrc: 'USUG12100860' };

    const score = matcher.scorePair(song, track).score;
    expect(score).toBe(100);
  });

  it('boosts middle uncertain track using Album Sequence Continuity Assistance (MusicBee Feature)', async () => {
    const service = new AlbumMetadataService();
    const album: AlbumMetadata = {
      releaseId: 'rel-1',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      trackCount: 3
    };

    const officialTracks = [
      { trackId: 't1', title: 'brutal', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 203 },
      { trackId: 't2', title: 'traitor', artist: 'Olivia Rodrigo', trackNumber: 2, duration: 229 },
      { trackId: 't3', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 3, duration: 242 }
    ];

    const localSongs = [
      { songId: 1, title: 'brutal', artist: 'Olivia Rodrigo', path: '/01.mp3', duration: 203 }, // High confidence
      { songId: 2, title: 'traitor', artist: 'Unknown', path: '/02.mp3', duration: 240 },      // Low/Uncertain confidence
      { songId: 3, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/03.mp3', duration: 242 } // High confidence
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.trackList[1].reasons).toContain('album_sequence_continuity_boost');
  });
});
