import { describe, expect, it } from 'vitest';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';

describe('Phase 2 — Album Auto-Tagger Engine & TrackMatcher', () => {
  it('scores track match higher on exact title and duration match regardless of track number', () => {
    const matcher = new TrackMatcher();
    const localSong = {
      songId: 101,
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      path: '/music/random_file.mp3',
      duration: 242
    };

    const officialTracks = [
      { trackId: 'rec-1', title: 'brutal', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 203 },
      { trackId: 'rec-3', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 3, duration: 242 }
    ];

    const result = matcher.matchTracks([localSong], 'rel-sour', officialTracks);
    expect(result).toHaveLength(1);
    expect(result[0].remoteTrack.recording.title).toBe('drivers license');
    expect(result[0].remoteTrack.recording.trackNumber).toBe(3);
    expect(result[0].confidence).toBe(1.0); // 50 title + 20 artist + 30 duration = 100 => 1.0
  });

  it('runs complete 8-stage Album Auto-Tagger pipeline (search -> resolve -> match -> preview -> apply)', async () => {
    const service = new AlbumMetadataService();

    // Stage 2: Search Album
    const searchResults = await service.search('SOUR', 'Olivia Rodrigo');
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].releaseId).toBe('mb-release-sour-std');

    // Stage 3: Resolve Release
    const release = await service.resolveRelease(searchResults[0].releaseId);
    expect(release?.title).toBe('SOUR');

    // Stage 4, 5, 6: Match Songs & Build Album Preview
    const localSongs = [
      { songId: 1, title: 'brutal', artist: 'Olivia Rodrigo', path: '/music/01.mp3', duration: 203 },
      { songId: 2, title: 'traitor', artist: 'Olivia Rodrigo', path: '/music/02.mp3', duration: 229 },
      { songId: 3, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/music/03.mp3', duration: 242 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, release!.releaseId!);
    expect(preview.album.title).toBe('SOUR');
    expect(preview.trackList).toHaveLength(3);
    expect(preview.confidence).toBeGreaterThan(0.9);
    expect(preview.warnings).toHaveLength(0);

    // Stage 7: Apply Album
    const applyResult = await service.applyAlbum(preview);
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedSongCount).toBe(3);
  });
});
