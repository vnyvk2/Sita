import * as songsDb from '@main/db/queries/songs';
import { SongMetadataBuilder } from '@main/metadata/transactions/SongMetadataBuilder';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@main/db/queries/songs', () => ({
  getSongById: vi.fn()
}));

describe('SongMetadataBuilder (Phase 4 Persistence & Identity)', () => {
  it('merges musicBrainzRecordingId, isrc, and discNumber from changes onto DB record', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 10,
      title: 'Current Title',
      duration: 210.5,
      year: 2010,
      trackNumber: 2,
      diskNumber: 1,
      musicBrainzRecordingId: 'rec-old-mbid',
      isrc: 'USRC20100001',
      artists: [{ artist: { id: 1, name: 'Current Artist' } }],
      albums: [{ album: { id: 2, title: 'Current Album' } }],
      genres: [{ genre: { id: 3, name: 'Current Genre' } }]
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(10, {
      title: 'Updated Title',
      musicBrainzRecordingId: 'rec-new-mbid',
      isrc: 'USRC20249999',
      discNumber: 2
    });

    expect(result.title).toBe('Updated Title');
    expect(result.musicBrainzRecordingId).toBe('rec-new-mbid');
    expect(result.isrc).toBe('USRC20249999');
    expect(result.discNumber).toBe(2);
    // Relational fields and IDs are preserved
    expect(result.artists?.[0]).toEqual({ artistId: 1, name: 'Current Artist' });
    expect(result.albums?.[0]).toEqual({ albumId: 2, title: 'Current Album' });
    expect(result.genres?.[0]).toEqual({ genreId: 3, name: 'Current Genre' });
  });

  it('preserves existing DB musicBrainzRecordingId, isrc, and discNumber when changes are undefined', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 11,
      title: 'Existing Title',
      duration: 180.0,
      year: 2018,
      trackNumber: 4,
      diskNumber: 1,
      musicBrainzRecordingId: 'rec-preserve-mbid',
      isrc: 'USRC20180004',
      artists: [],
      albums: [],
      genres: []
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(11, {
      title: 'Only Title Changed'
    });

    expect(result.title).toBe('Only Title Changed');
    expect(result.musicBrainzRecordingId).toBe('rec-preserve-mbid');
    expect(result.isrc).toBe('USRC20180004');
    expect(result.discNumber).toBe(1);
  });

  it('clears musicBrainzRecordingId and isrc when passed empty string (clear semantics)', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 12,
      title: 'To Clear',
      duration: 150.0,
      musicBrainzRecordingId: 'rec-will-be-cleared',
      isrc: 'USRC12345678',
      artists: [],
      albums: [],
      genres: []
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(12, {
      musicBrainzRecordingId: '',
      isrc: ''
    });

    expect(result.musicBrainzRecordingId).toBe('');
    expect(result.isrc).toBe('');
  });

  it('correctly maps discNumber when provided in metadata changes', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 13,
      title: 'Disc Test',
      duration: 120.0,
      diskNumber: 1,
      artists: [],
      albums: [],
      genres: []
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(13, {
      discNumber: 3
    });

    expect(result.discNumber).toBe(3);
  });

  it('merges genre and style with case-insensitive deduplication and preserves existing genre IDs', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 14,
      title: 'Genre Merge Test',
      duration: 190.0,
      artists: [],
      albums: [],
      genres: [{ genre: { id: 42, name: 'Rock' } }]
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(14, {
      genre: 'rock',
      style: 'Rock, Indie Rock'
    });

    expect(result.genres).toHaveLength(2);
    // Preserves existing genre ID 42 from "Rock" even when incoming was lowercased "rock"
    expect(result.genres?.[0]).toEqual({ genreId: 42, name: 'Rock' });
    expect(result.genres?.[1]).toEqual({ name: 'Indie Rock' });
  });

  it('merges multiple delimiters in genre & style while preserving compound genres like Hip-Hop/Rap and AC/DC', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 15,
      title: 'Compound Genre Test',
      duration: 240.0,
      artists: [],
      albums: [],
      genres: []
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(15, {
      genre: 'Rock, Pop',
      style: 'Post-Punk; Shoegaze, Hip-Hop/Rap, R&B/Soul, AC/DC, Rock & Roll'
    });

    const genreNames = result.genres?.map((g) => g.name);
    expect(genreNames).toEqual([
      'Rock',
      'Pop',
      'Post-Punk',
      'Shoegaze',
      'Hip-Hop/Rap',
      'R&B/Soul',
      'AC/DC',
      'Rock & Roll'
    ]);
  });

  it('deduplicates when an existing canonical genre appears in both genre and style with different casing', async () => {
    vi.mocked(songsDb.getSongById).mockResolvedValueOnce({
      id: 16,
      title: 'Deduplicate Both Fields Test',
      duration: 200.0,
      artists: [],
      albums: [],
      genres: [{ genre: { id: 42, name: 'Rock' } }]
    } as any);

    const result = await SongMetadataBuilder.buildCompleteTags(16, {
      genre: 'Rock',
      style: 'rock'
    });

    expect(result.genres).toHaveLength(1);
    expect(result.genres?.[0]).toEqual({ genreId: 42, name: 'Rock' });
  });
});
