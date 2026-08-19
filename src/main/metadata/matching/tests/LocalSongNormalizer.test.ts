import { describe, expect, it } from 'vitest';
import { LocalSongNormalizer } from '../LocalSongNormalizer';

describe('LocalSongNormalizer', () => {
  it('normalizes standard flat LocalSongInput without data loss', () => {
    const input = {
      songId: 101,
      title: 'brutal',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      year: 2021,
      trackNumber: 1,
      discNumber: 1,
      genre: 'Pop, Alternative Rock',
      duration: 177.5,
      isrc: 'USUG12101487',
      musicBrainzRecordingId: 'mb-rec-1',
      path: '/music/01-brutal.mp3'
    };

    const normalized = LocalSongNormalizer.normalize(input);
    expect(normalized).toEqual(input);
  });

  it('normalizes renderer SongData relational structure correctly', () => {
    const songData = {
      songId: 202,
      title: 'traitor',
      artists: [{ artistId: 1, name: 'Olivia Rodrigo' }, { artistId: 2, name: 'Dan Nigro' }],
      album: { albumId: 5, name: 'SOUR', isAFavorite: true },
      genres: [{ genreId: 10, name: 'Pop' }, { genreId: 11, name: 'Indie Pop' }],
      trackNo: 2,
      discNo: 1,
      duration: 229,
      path: '/music/02-traitor.mp3'
    };

    const normalized = LocalSongNormalizer.normalize(songData);

    expect(normalized.songId).toBe(202);
    expect(normalized.title).toBe('traitor');
    expect(normalized.artist).toBe('Olivia Rodrigo, Dan Nigro');
    expect(normalized.album).toBe('SOUR');
    expect(normalized.genre).toBe('Pop, Indie Pop');
    expect(normalized.trackNumber).toBe(2);
    expect(normalized.discNumber).toBe(1);
    expect(normalized.duration).toBe(229);
    expect(normalized.path).toBe('/music/02-traitor.mp3');
  });

  it('maps Drizzle SQLite relational getSongById output via fromDbSong', () => {
    const dbSong = {
      id: 303,
      title: 'drivers license',
      path: '/music/03-drivers-license.mp3',
      duration: '242.000',
      year: 2021,
      trackNumber: 3,
      diskNumber: 1,
      isrc: 'USUG12100001',
      musicBrainzRecordingId: 'mb-dl-3',
      artists: [
        {
          artist: { id: 1, name: 'Olivia Rodrigo' }
        }
      ],
      albums: [
        {
          album: { id: 5, title: 'SOUR', isFavorite: false }
        }
      ],
      genres: [
        {
          genre: { id: 12, name: 'Bedroom Pop' }
        }
      ]
    };

    const normalized = LocalSongNormalizer.fromDbSong(dbSong);

    expect(normalized.songId).toBe(303);
    expect(normalized.title).toBe('drivers license');
    expect(normalized.artist).toBe('Olivia Rodrigo');
    expect(normalized.album).toBe('SOUR');
    expect(normalized.genre).toBe('Bedroom Pop');
    expect(normalized.year).toBe(2021);
    expect(normalized.trackNumber).toBe(3);
    expect(normalized.discNumber).toBe(1);
    expect(normalized.duration).toBe(242);
    expect(normalized.isrc).toBe('USUG12100001');
    expect(normalized.musicBrainzRecordingId).toBe('mb-dl-3');
  });

  it('safely handles empty or missing inputs with defaults', () => {
    expect(LocalSongNormalizer.normalize(null)).toEqual({ songId: 0, title: '', path: '' });
    expect(LocalSongNormalizer.normalize(undefined)).toEqual({ songId: 0, title: '', path: '' });
    expect(LocalSongNormalizer.fromDbSong(null)).toEqual({ songId: 0, title: '', path: '' });
  });
});
