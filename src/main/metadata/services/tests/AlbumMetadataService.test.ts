import { describe, expect, it } from 'vitest';
import { MetadataNormalizer } from '../../matching/MetadataNormalizer';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 Final Polish — Production-Grade Metadata Engine & Matcher Suite', () => {
  it('preserves Roman numerals in track titles during title normalization', () => {
    expect(MetadataNormalizer.normalizeTitle('Shine On You Crazy Diamond Part II')).toBe('shine on you crazy diamond part ii');
    expect(MetadataNormalizer.normalizeTitle('Symphony No. 5 Movement III')).toBe('symphony number 5 movement iii');
  });

  it('caps maximum variant penalty at 50 points', () => {
    const matcher = new TrackMatcher();
    const song = { songId: 1, title: 'Song (Live Acoustic Demo Instrumental)', artist: 'Artist', path: 'song.mp3', duration: 200 };
    const track = { trackId: 't1', title: 'Song', artist: 'Artist', trackNumber: 1, duration: 200 };

    const { score } = matcher.scorePair(song, track);
    // Unpenalized score: 50 title + 20 artist + 30 duration = 100
    // Capped variant penalty: max -50 => score 50
    expect(score).toBe(50);
  });

  it('evaluates authoritative ISRC match early returning 100 points without heuristic stacking', () => {
    const matcher = new TrackMatcher();
    const song = { songId: 1, title: 'Wrong Title', artist: 'Wrong Artist', album: 'Wrong Album', path: 'a.mp3', isrc: 'USUG12100860' };
    const track = { trackId: 't1', title: 'drivers license', artist: 'Olivia Rodrigo', album: 'SOUR', trackNumber: 1, isrc: 'USUG12100860' };

    const { score, breakdown } = matcher.scorePair(song, track);
    expect(score).toBe(100);
    expect(breakdown.mbid).toBe(100);
    expect(breakdown.title).toBe(0);
    expect(breakdown.album).toBe(0);
  });

  it('exposes confidence levels (Excellent, Very Good, Good, Review, Poor)', () => {
    const matcher = new TrackMatcher();
    const song = { songId: 1, title: 'drivers license', artist: 'Olivia Rodrigo', path: '01.mp3', duration: 242 };
    const track = { trackId: 't1', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 242 };

    const result = matcher.matchTracks([song], 'rel-1', [track]);
    expect(result[0].confidenceLevel).toBe('Excellent');
  });

  it('keys duplicate candidate detection on title + artist', () => {
    const matcher = new TrackMatcher();
    const localSongs = [
      { songId: 1, title: 'Intro', artist: 'Artist A', path: 'a.mp3', duration: 100 },
      { songId: 2, title: 'Intro', artist: 'Artist B', path: 'b.mp3', duration: 100 }
    ];

    const officialTracks = [
      { trackId: 't1', title: 'Intro', artist: 'Artist A', trackNumber: 1, duration: 100 }
    ];

    const result = matcher.matchTracks(localSongs, 'rel-1', officialTracks);
    // Different artists => NOT flagged as duplicate local candidate
    expect(result[0].reasons).not.toContain('duplicate_local_candidate');
  });

  it('runs AlbumAutoTagger preview with strict confidence levels', async () => {
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
      { songId: 1, title: 'brutal', artist: 'Olivia Rodrigo', path: '01.mp3', duration: 203 },
      { songId: 2, title: 'traitor', artist: 'Unknown', path: '02.mp3', duration: 240 },
      { songId: 3, title: 'drivers license', artist: 'Olivia Rodrigo', path: '03.mp3', duration: 242 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.trackList[0].confidenceLevel).toBe('Excellent');
    expect(preview.trackList[1].reasons).toContain('album_sequence_continuity_boost');
  });
});
