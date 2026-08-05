import { describe, expect, it } from 'vitest';
import { MetadataNormalizer } from '../../matching/MetadataNormalizer';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 Complete — Production-Grade Metadata Engine & Matcher Suite', () => {
  it('detects useless placeholder titles (Track01, Unknown, Audio Track)', () => {
    expect(MetadataNormalizer.isUselessTitle('Track 01')).toBe(true);
    expect(MetadataNormalizer.isUselessTitle('Unknown Title')).toBe(true);
    expect(MetadataNormalizer.isUselessTitle('Audio Track')).toBe(true);
    expect(MetadataNormalizer.isUselessTitle('drivers license')).toBe(false);
  });

  it('falls back to filename normalization when song title is useless placeholder', () => {
    const matcher = new TrackMatcher();
    const songWithPlaceholder = {
      songId: 1,
      title: 'Track 01',
      artist: 'Olivia Rodrigo',
      path: '01 - brutal.mp3',
      duration: 203
    };

    const officialTrack = {
      trackId: 't1',
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      trackNumber: 1,
      duration: 203
    };

    const { score, matchedBy } = matcher.scorePair(songWithPlaceholder, officialTrack);
    expect(score).toBe(100);
    expect(matchedBy).toContain('title');
  });

  it('scores album title match (+15 pts) and year bonus (+5 pts)', () => {
    const matcher = new TrackMatcher();
    const song = {
      songId: 1,
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      year: 2021,
      path: '/music/track.mp3',
      duration: 242
    };

    const track = {
      trackId: 't1',
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      year: 2021,
      trackNumber: 1,
      duration: 242
    };

    const { breakdown } = matcher.scorePair(song, track);
    expect(breakdown.album).toBe(15);
    expect(breakdown.year).toBe(5);
  });

  it('emits duplicate_local_candidate warning when multiple local songs have duplicate titles', () => {
    const matcher = new TrackMatcher();
    const localSongs = [
      { songId: 1, title: 'Intro', artist: 'Artist', path: '/01.mp3', duration: 100 },
      { songId: 2, title: 'Intro', artist: 'Artist', path: '/02.mp3', duration: 100 }
    ];

    const officialTracks = [
      { trackId: 't1', title: 'Intro', artist: 'Artist', trackNumber: 1, duration: 100 }
    ];

    const result = matcher.matchTracks(localSongs, 'rel-1', officialTracks);
    expect(result).toHaveLength(1);
    expect(result[0].reasons).toContain('duplicate_local_candidate');
  });

  it('generates human-readable why match explanation strings', () => {
    const matcher = new TrackMatcher();
    const song = {
      songId: 1,
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      path: '/track.mp3',
      duration: 242
    };

    const track = {
      trackId: 't1',
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      trackNumber: 1,
      duration: 242
    };

    const result = matcher.matchTracks([song], 'rel-sour', [track]);
    expect(result[0].why).toContain('Title');
    expect(result[0].why).toContain('Artist');
    expect(result[0].why).toContain('Album');
    expect(result[0].why).toContain('Duration');
  });

  it('requires consecutive track numbers for Album Sequence Continuity boost (MusicBee feature)', async () => {
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
      { songId: 1, title: 'brutal', artist: 'Olivia Rodrigo', path: '/01.mp3', duration: 203 },
      { songId: 2, title: 'traitor', artist: 'Unknown', path: '/02.mp3', duration: 240 },
      { songId: 3, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/03.mp3', duration: 242 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.trackList[1].reasons).toContain('album_sequence_continuity_boost');
  });
});
