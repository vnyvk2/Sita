import { describe, expect, it } from 'vitest';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 — Album Auto-Tagger Engine & 1-to-1 TrackMatcher', () => {
  it('enforces ONE-TO-ONE matching so two local songs cannot claim the same official track', () => {
    const matcher = new TrackMatcher();
    const localSongs = [
      { songId: 101, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/music/track1.mp3', duration: 242 },
      { songId: 102, title: 'drivers license (dup)', artist: 'Olivia Rodrigo', path: '/music/track2.mp3', duration: 242 }
    ];

    const officialTracks = [
      { trackId: 'rec-3', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 3, duration: 242 }
    ];

    const result = matcher.matchTracks(localSongs, 'rel-sour', officialTracks);
    // Strict 1-to-1 assignment must assign the official track to ONLY one local song
    expect(result).toHaveLength(1);
    expect(result[0].localSong.songId).toBe(101);
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
      { songId: 1, title: 'brutal', artist: 'Olivia Rodrigo', path: '/music/01.mp3', duration: 203 },
      { songId: 2, title: 'traitor', artist: 'Olivia Rodrigo', path: '/music/02.mp3', duration: 229 },
      { songId: 3, title: 'unknown title', artist: 'Olivia Rodrigo', path: '/music/03.mp3', duration: 100 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.album.title).toBe('SOUR');
    expect(preview.trackList).toHaveLength(3);
    
    // Song 3 should have low confidence (< 0.75) and trigger a warning
    expect(preview.warnings.length).toBeGreaterThan(0);

    // Apply album: only tracks with confidence >= 0.90 should be auto-applied
    const applyResult = await service.applyAlbum(preview);
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedSongCount).toBe(2); // Only 2 tracks met >= 0.90 threshold
  });
});
