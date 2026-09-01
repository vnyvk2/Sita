import { ITunesApiClient } from '@main/platform/networking/ITunesApiClient';
import { describe, expect, it } from 'vitest';

describe('Live Global Catalog End-to-End Tests', () => {
  const itunesClient = new ITunesApiClient();

  it('successfully fetches real albums and 30s previews for A. R. Rahman', async () => {
    const albums = await itunesClient.getArtistAlbums('A. R. Rahman', 10);
    expect(albums.length).toBeGreaterThan(0);
    expect(albums[0].collectionName).toBeDefined();
    expect(albums[0].artworkUrl600).toBeDefined();

    const tracks = await itunesClient.getAlbumTracks(albums[0].collectionId);
    expect(tracks.length).toBeGreaterThan(0);
    expect(tracks[0].trackName).toBeDefined();
    expect(tracks.some((t) => typeof t.previewUrl === 'string' && t.previewUrl.length > 0)).toBe(
      true
    );
  }, 15000);

  it('successfully fetches real top tracks for Daft Punk', async () => {
    const topTracks = await itunesClient.getArtistTopTracks('Daft Punk', 5);
    expect(topTracks.length).toBeGreaterThan(0);
    expect(topTracks[0].trackName).toBeDefined();
    expect(topTracks.some((t) => typeof t.previewUrl === 'string')).toBe(true);
  }, 15000);

  it('successfully fetches real albums for Adele', async () => {
    const albums = await itunesClient.getArtistAlbums('Adele', 5);
    expect(albums.length).toBeGreaterThan(0);
    expect(
      albums.some(
        (a) =>
          a.collectionName.includes('21') ||
          a.collectionName.includes('25') ||
          a.collectionName.includes('30')
      )
    ).toBe(true);
  }, 15000);
});
