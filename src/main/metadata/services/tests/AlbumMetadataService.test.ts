import { describe, expect, it } from 'vitest';
import { MetadataNormalizer } from '../../matching/MetadataNormalizer';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService, getConfidenceLevel } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 Complete — Presentation-Agnostic Metadata Engine Suite', () => {
  it('maps confidence scores to confidence levels cleanly via getConfidenceLevel helper', () => {
    expect(getConfidenceLevel(1.0)).toBe('Excellent');
    expect(getConfidenceLevel(0.96)).toBe('Excellent');
    expect(getConfidenceLevel(0.92)).toBe('Very Good');
    expect(getConfidenceLevel(0.85)).toBe('Good');
    expect(getConfidenceLevel(0.72)).toBe('Review');
    expect(getConfidenceLevel(0.50)).toBe('Poor');
  });

  it('generates presentation-agnostic clean why match explanation strings without symbols', () => {
    const matcher = new TrackMatcher();
    const song = {
      songId: 1,
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      path: 'track.mp3',
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
    expect(result[0].why).toBe('Title Match | Artist Match | Album Match | Duration Match');
  });

  it('caps album sequence continuity boost at 0.89 below auto-apply threshold (0.90)', async () => {
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
    // Sequence boost must be capped at 0.89 so sequence alone never triggers auto-apply (>= 0.90)
    expect(preview.trackList[1].confidence).toBeLessThanOrEqual(0.89);
    expect(preview.trackList[1].confidenceLevel).toBe('Good');
  });
});
