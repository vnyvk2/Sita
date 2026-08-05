import { describe, expect, it } from 'vitest';
import { MetadataNormalizer } from '../../matching/MetadataNormalizer';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { AlbumMetadataService } from '../AlbumMetadataService';
import type { AlbumMetadata } from '../../models/RecordingMetadata';

describe('Phase 2 — Smart Metadata Normalizer & Variant-Aware TrackMatcher', () => {
  it('normalizes titles by stripping cosmetic noise (Official Video, Lyrics, etc.)', () => {
    expect(MetadataNormalizer.normalizeTitle('Believer (Official Video)')).toBe('believer');
    expect(MetadataNormalizer.normalizeTitle('drivers license [Lyric Video]')).toBe('drivers license');
    expect(MetadataNormalizer.normalizeTitle('brutal (Official Audio)')).toBe('brutal');
  });

  it('normalizes artist joiners and acronym punctuation', () => {
    expect(MetadataNormalizer.normalizeArtist('Artist A feat. Artist B')).toBe('artist a artist b');
    expect(MetadataNormalizer.normalizeArtist('A.R. Rahman')).toBe('ar rahman');
  });

  it('extracts recording variants (Live, Acoustic, Demo, Remix, etc.)', () => {
    const variants = MetadataNormalizer.extractVariants('drivers license (Live Acoustic Session)');
    expect(variants.has('live')).toBe(true);
    expect(variants.has('acoustic')).toBe(true);
    expect(variants.has('session')).toBe(true);
  });

  it('applies variant mismatch penalty when local song is Live and official track is Studio', () => {
    const matcher = new TrackMatcher();
    const liveSong = {
      songId: 1,
      title: 'drivers license (Live)',
      artist: 'Olivia Rodrigo',
      path: '/music/live.mp3',
      duration: 242
    };

    const studioTrack = {
      trackId: 'rec-3',
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      trackNumber: 3,
      duration: 242
    };

    const { score, reasons } = matcher.scorePair(liveSong, studioTrack);
    // Unpenalized score: 50 title + 20 artist + 30 duration = 100
    // Live variant mismatch penalty: -30 => 70
    expect(score).toBe(70);
    expect(reasons).toContain('variant_mismatch_live');
  });

  it('scores exact ISRC match at 90 points priority', () => {
    const matcher = new TrackMatcher();
    const localSong = {
      songId: 2,
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      path: '/music/track.mp3',
      isrc: 'USUG12100860'
    };

    const officialTrack = {
      trackId: 'rec-1',
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      trackNumber: 1,
      isrc: 'USUG12100860'
    };

    const { score, reasons } = matcher.scorePair(localSong, officialTrack);
    expect(score).toBe(90);
    expect(reasons).toContain('isrc_exact_match');
  });

  it('applies gradual duration decay scoring for duration differences', () => {
    const matcher = new TrackMatcher();
    const songA = { songId: 1, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/a.mp3', duration: 242 };
    const songB = { songId: 2, title: 'drivers license', artist: 'Olivia Rodrigo', path: '/b.mp3', duration: 247 }; // 5s diff

    const track = { trackId: 't1', title: 'drivers license', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 242 };

    const scoreA = matcher.scorePair(songA, track).score; // 0s diff -> 100
    const scoreB = matcher.scorePair(songB, track).score; // 5s diff -> 50 + 20 + Math.round(30 - 7.5) = 93

    expect(scoreA).toBe(100);
    expect(scoreB).toBe(93);
    expect(scoreA).toBeGreaterThan(scoreB);
  });

  it('runs AlbumAutoTagger preview with smart normalization and strict 0.90 threshold', async () => {
    const service = new AlbumMetadataService();

    const album: AlbumMetadata = {
      releaseId: 'rel-sour',
      title: 'SOUR',
      artist: 'Olivia Rodrigo',
      year: 2021,
      label: 'Geffen Records',
      discCount: 1,
      trackCount: 2
    };

    const officialTracks = [
      { trackId: 'rec-1', title: 'brutal', artist: 'Olivia Rodrigo', trackNumber: 1, duration: 203 },
      { trackId: 'rec-2', title: 'traitor', artist: 'Olivia Rodrigo', trackNumber: 2, duration: 229 }
    ];

    const localSongs = [
      { songId: 1, title: '01 - brutal (Official Music Video)', artist: 'Olivia Rodrigo', path: '/music/01.mp3', duration: 203 },
      { songId: 2, title: 'Track 02 - traitor [Lyric Video]', artist: 'Olivia Rodrigo', path: '/music/02.mp3', duration: 229 }
    ];

    const preview = await service.buildAlbumMatch(localSongs, album, officialTracks);
    expect(preview.album.title).toBe('SOUR');
    expect(preview.trackList).toHaveLength(2);
    expect(preview.confidence).toBeGreaterThanOrEqual(0.9);

    const applyResult = await service.applyAlbum(preview);
    expect(applyResult.success).toBe(true);
    expect(applyResult.updatedSongCount).toBe(2);
  });
});
