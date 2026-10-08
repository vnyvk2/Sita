import { beforeEach, describe, expect, it, vi } from 'vitest';

import { syncSongRelationalData } from '../syncSongRelationalData';

vi.mock('@main/db/queries/artists', () => ({
  getArtistWithName: vi.fn(),
  createArtist: vi.fn(),
  linkSongToArtist: vi.fn(),
  unlinkSongFromArtist: vi.fn(),
  getArtistSongIds: vi.fn(),
  getArtistAlbumIds: vi.fn(),
  deleteArtist: vi.fn()
}));

vi.mock('@main/db/queries/genres', () => ({
  getGenreByName: vi.fn(),
  createGenre: vi.fn(),
  linkSongToGenre: vi.fn(),
  unlinkSongFromGenre: vi.fn(),
  getGenreSongIds: vi.fn(),
  deleteGenre: vi.fn()
}));

vi.mock('@main/db/queries/albums', () => ({
  linkSongToAlbum: vi.fn(),
  unlinkSongFromAlbum: vi.fn(),
  getAlbumWithTitle: vi.fn(),
  createAlbum: vi.fn(),
  getAlbumSongIds: vi.fn(),
  deleteAlbum: vi.fn(),
  linkArtistToAlbum: vi.fn()
}));

vi.mock('@main/db/queries/artworks', () => ({
  saveArtworks: vi.fn(),
  syncSongArtworks: vi.fn(),
  syncAlbumArtworks: vi.fn()
}));

import {
  createArtist,
  deleteArtist,
  getArtistSongIds,
  getArtistWithName,
  linkSongToArtist,
  unlinkSongFromArtist
} from '@main/db/queries/artists';
import {
  deleteGenre,
  getGenreByName,
  linkSongToGenre,
  unlinkSongFromGenre
} from '@main/db/queries/genres';

describe('DEF-TAG-02: name-only tags must not unlink/delete the just-linked entity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a same-named artist linked when the caller supplies no artistId', async () => {
    vi.mocked(getArtistWithName).mockResolvedValue({ id: 7, name: 'Same' } as any);
    const song = { artists: [{ artist: { id: 7, name: 'Same' } }] };

    await syncSongRelationalData({
      songId: 1,
      song,
      tags: { artists: [{ name: 'Same' }] } as any,
      trx: {} as any
    });

    expect(linkSongToArtist).toHaveBeenCalledWith(7, 1, expect.anything());
    expect(unlinkSongFromArtist).not.toHaveBeenCalled();
    expect(deleteArtist).not.toHaveBeenCalled();
    expect(getArtistSongIds).not.toHaveBeenCalled();
  });

  it('keeps a same-named genre linked when the caller supplies no genreId', async () => {
    vi.mocked(getGenreByName).mockResolvedValue({ id: 3, name: 'Rock' } as any);
    const song = { genres: [{ genre: { id: 3, name: 'Rock' } }] };

    await syncSongRelationalData({
      songId: 1,
      song,
      tags: { genres: [{ name: 'Rock' }] } as any,
      trx: {} as any
    });

    expect(linkSongToGenre).toHaveBeenCalledWith(3, 1, expect.anything());
    expect(unlinkSongFromGenre).not.toHaveBeenCalled();
    expect(deleteGenre).not.toHaveBeenCalled();
  });

  it('still unlinks an artist that was genuinely replaced', async () => {
    vi.mocked(getArtistWithName).mockResolvedValue({ id: 9, name: 'New' } as any);
    const { getArtistSongIds: songIds, getArtistAlbumIds: albumIds } =
      await import('@main/db/queries/artists');
    vi.mocked(songIds).mockResolvedValue([5]);
    vi.mocked(albumIds).mockResolvedValue([]);
    const song = { artists: [{ artist: { id: 7, name: 'Old' } }] };

    await syncSongRelationalData({
      songId: 1,
      song,
      tags: { artists: [{ name: 'New' }] } as any,
      trx: {} as any
    });

    expect(unlinkSongFromArtist).toHaveBeenCalledWith(7, 1, expect.anything());
    expect(createArtist).not.toHaveBeenCalled();
  });
});
