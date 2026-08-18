import { beforeEach, describe, expect, it, vi } from 'vitest';
import manageAlbumsOfParsedSong from '../manageAlbumsOfParsedSong';
import { createAlbum, getAlbumWithTitle, linkSongToAlbum } from '@main/db/queries/albums';
import { linkArtworksToAlbum, syncAlbumArtworks } from '@main/db/queries/artworks';

vi.mock('@main/db/queries/albums', () => ({
  createAlbum: vi.fn(),
  getAlbumWithTitle: vi.fn(),
  linkSongToAlbum: vi.fn()
}));

vi.mock('@main/db/queries/artworks', () => ({
  linkArtworksToAlbum: vi.fn(),
  syncAlbumArtworks: vi.fn()
}));

describe('manageAlbumsOfParsedSong album artwork linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new album and links artwork when album does not exist', async () => {
    vi.mocked(getAlbumWithTitle).mockResolvedValue(null as any);
    vi.mocked(createAlbum).mockResolvedValue({ id: 100, title: 'SOUR', year: 2021 } as any);

    const result = await manageAlbumsOfParsedSong(
      {
        songId: 1,
        artworkId: 50,
        songYear: 2021,
        artists: ['Olivia Rodrigo'],
        albumArtists: ['Olivia Rodrigo'],
        albumName: 'SOUR'
      },
      {} as any
    );

    expect(createAlbum).toHaveBeenCalledWith({ title: 'SOUR', year: 2021 }, expect.anything());
    expect(linkArtworksToAlbum).toHaveBeenCalledWith([{ albumId: 100, artworkId: 50 }], expect.anything());
    expect(linkSongToAlbum).toHaveBeenCalledWith(100, 1, expect.anything());
    expect(result.relevantAlbum?.id).toBe(100);
    expect(result.newAlbum?.id).toBe(100);
  });

  it('synchronizes artwork with existing album when album already exists', async () => {
    vi.mocked(getAlbumWithTitle).mockResolvedValue({ id: 285, title: 'SOUR', year: 2021 } as any);

    const result = await manageAlbumsOfParsedSong(
      {
        songId: 1,
        artworkId: 99,
        songYear: 2021,
        artists: ['Olivia Rodrigo'],
        albumArtists: ['Olivia Rodrigo'],
        albumName: 'SOUR'
      },
      {} as any
    );

    expect(createAlbum).not.toHaveBeenCalled();
    expect(syncAlbumArtworks).toHaveBeenCalledWith(285, [99], expect.anything());
    expect(linkSongToAlbum).toHaveBeenCalledWith(285, 1, expect.anything());
    expect(result.relevantAlbum?.id).toBe(285);
    expect(result.newAlbum).toBeUndefined();
  });

  it('links song without artwork sync if artworkId is omitted on existing album', async () => {
    vi.mocked(getAlbumWithTitle).mockResolvedValue({ id: 285, title: 'SOUR', year: 2021 } as any);

    const result = await manageAlbumsOfParsedSong(
      {
        songId: 1,
        songYear: 2021,
        artists: ['Olivia Rodrigo'],
        albumArtists: ['Olivia Rodrigo'],
        albumName: 'SOUR'
      },
      {} as any
    );

    expect(syncAlbumArtworks).not.toHaveBeenCalled();
    expect(linkSongToAlbum).toHaveBeenCalledWith(285, 1, expect.anything());
    expect(result.relevantAlbum?.id).toBe(285);
  });
});
