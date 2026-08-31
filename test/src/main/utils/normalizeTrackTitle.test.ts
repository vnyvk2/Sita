import { describe, expect, it } from 'vitest';
import {
  normalizeTrackTitle,
  matchOnlineTrackToLocalSong,
  deduplicateCandidateTracks
} from '@main/utils/normalizeTrackTitle';

describe('normalizeTrackTitle', () => {
  it('strips remastered, live, bonus, and feature suffixes correctly', () => {
    expect(normalizeTrackTitle('Bohemian Rhapsody (Remastered 2011)')).toBe('bohemian rhapsody');
    expect(normalizeTrackTitle('Hotel California - Live at the Forum')).toBe('hotel california');
    expect(normalizeTrackTitle('Save Your Tears (feat. Ariana Grande) [Remix]')).toBe('save your tears');
    expect(normalizeTrackTitle('Cruel Summer (Live from The Eras Tour)')).toBe('cruel summer');
    expect(normalizeTrackTitle('Anti-Hero (Acoustic Version)')).toBe('anti hero');
    expect(normalizeTrackTitle('Lose Yourself - 2002 Remaster')).toBe('lose yourself');
  });

  it('matches online tracks against local songs with duration tolerance', () => {
    const localSongs = [
      { id: 101, title: 'Bohemian Rhapsody', duration: 354 },
      { id: 102, title: 'Don\'t Stop Me Now', duration: 209 },
      { id: 103, title: 'Cruel Summer', duration: 178 }
    ];

    const match1 = matchOnlineTrackToLocalSong('Bohemian Rhapsody (2011 Remaster)', 355, localSongs);
    expect(match1).not.toBeNull();
    expect(match1?.localSongId).toBe(101);
    expect(match1?.confidence).toBe('exact');

    const match2 = matchOnlineTrackToLocalSong('Cruel Summer - Live', 185, localSongs);
    expect(match2).not.toBeNull();
    expect(match2?.localSongId).toBe(103);
    expect(match2?.confidence).toBe('fuzzy');

    const match3 = matchOnlineTrackToLocalSong('Non Existent Song', 200, localSongs);
    expect(match3).toBeNull();
  });

  it('deduplicates candidate tracks and preserves highest playcount/rank', () => {
    const candidateTracks = [
      { title: 'Bohemian Rhapsody', playcount: 10000, listeners: 5000 },
      { title: 'Bohemian Rhapsody (Live at Wembley)', playcount: 2000, listeners: 1000 },
      { title: 'Bohemian Rhapsody - 2011 Remaster', playcount: 8000, listeners: 4000 },
      { title: 'Radio Ga Ga', playcount: 6000, listeners: 3000 }
    ];

    const deduped = deduplicateCandidateTracks(candidateTracks);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].title).toBe('Bohemian Rhapsody');
    expect(deduped[0].playcount).toBe(10000);
    expect(deduped[1].title).toBe('Radio Ga Ga');
  });
});
