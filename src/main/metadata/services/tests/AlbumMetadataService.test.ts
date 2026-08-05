import { describe, expect, it } from 'vitest';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 — Album Auto-Tagger Engine, TrackMatcher & Score Breakdown', () => {
  it('strips filename track prefixes (01 -, Track 01 -, CD1-01-) during normalization', () => {
    const matcher = new TrackMatcher();
    expect(matcher.normalize('01 - brutal.mp3')).toBe('brutal');
    expect(matcher.normalize('Track 02 - traitor.flac')).toBe('traitor');
    expect(matcher.normalize('CD1-03-drivers license.m4a')).toBe('drivers license');
  });

  it('exposes detailed numeric score breakdown in match pairs', () => {
    const matcher = new TrackMatcher();
    const localSong = {
      songId: 101,
      title: '03 - drivers license.mp3',
      artist: 'Olivia Rodrigo',
      path: '/music/03 - drivers license.mp3',
      duration: 242
    };

    const officialTracks = [
      { trackId: 'rec-3', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 3, duration: 242 }
    ];

    const result = matcher.matchTracks([localSong], 'rel-sour', officialTracks);
    expect(result).toHaveLength(1);
    expect(result[0].scoreBreakdown).toEqual({
      title: 50,
      artist: 20,
      duration: 30,
      mbid: 0,
      total: 100
    });
  });

  it('filters out matches below MIN_MATCH_SCORE (50 pts threshold)', () => {
    const matcher = new TrackMatcher();
    const localSong = {
      songId: 999,
      title: 'completely random unmatched song',
      artist: 'Unknown',
      path: '/music/random.mp3',
      duration: 999
    };

    const officialTracks = [
      { trackId: 'rec-1', title: 'brutal', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 203 }
    ];

    const result = matcher.matchTracks([localSong], 'rel-sour', officialTracks);
    // Low score (< 50 pts) must not be assigned
    expect(result).toHaveLength(0);
  });

  it('runs AlbumAutoTagger preview and applies strict >= 0.90 confidence threshold', async () => {
    const service = new AlbumMetadataService();

    const album: AlbumMetadata = {
      releaseId: 'rel-sour',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      year: 2021,
      label: 'Geffen Records',
      discCount: 1,
      trackCount: 3
    };

    const officialTracks = [
      { trackId: 'rec-1', title: 'brutal', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 203 },
      { trackId: 'rec-2', title: 'traitor', artist: 'Olivia Rodrigo', trackNumber: 2, duration: 229 },
      { trackId: 'rec-3', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 3, duration: 242 }
    ];

    const localSongs = [
      { songId: 1, title: '01 - brutal', artist: 'Olivia Rodrigo', path: '/music/01.mp3', duration: 203 },
      { songId: 2, title: '02 - traitor', artist: 'Olivia Rodrigo', path: '/music/02.mp3', duration: 229 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.album.title).toBe('SOUR');
    expect(preview.trackList).toHaveLength(2);
    expect(preview.confidence).toBeGreaterThan(0.9);

    const applyResult = await service.applyAlbum(preview);
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedSongCount).toBe(2);
  });
});
