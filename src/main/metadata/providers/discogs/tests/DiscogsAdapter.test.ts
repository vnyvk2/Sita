import { describe, expect, it, vi } from 'vitest';
import { RequestPipeline } from '../../../../platform/networking/RequestPipeline';
import { IdentityResolutionCache } from '../../../cache/IdentityResolutionCache';
import { DiscogsApiClient } from '../DiscogsApiClient';
import { DiscogsAdapter } from '../DiscogsAdapter';

describe('Phase 14F — Discogs Contribution Adapter Suite', () => {
  it('fetchContribution() returns specialized Discogs contributions (genre, style, catalogNumber, masterRelease)', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new DiscogsApiClient(pipeline);
    const cache = new IdentityResolutionCache();
    const adapter = new DiscogsAdapter(apiClient, { cache });

    vi.spyOn(apiClient, 'searchReleases').mockResolvedValueOnce([
      {
        id: 123456,
        title: 'Olivia Rodrigo - SOUR',
        year: '2021',
        genre: ['Pop', 'Rock'],
        style: ['Pop Rock', 'Alternative Rock'],
        catno: 'GEF-001',
        master_id: 7890
      }
    ]);

    vi.spyOn(apiClient, 'getReleaseById').mockResolvedValueOnce({
      id: 123456,
      title: 'SOUR',
      artists: [{ name: 'Olivia Rodrigo' }],
      year: 2021,
      genres: ['Pop', 'Rock'],
      styles: ['Pop Rock', 'Alternative Rock'],
      labels: [{ catno: 'GEF-001', name: 'Geffen' }],
      master_id: 7890
    });

    const contribution = await adapter.fetchContribution({ title: 'SOUR', artist: 'Olivia Rodrigo' });

    expect(contribution).not.toBeNull();
    expect(contribution?.providerId).toBe('discogs');
    expect(contribution?.contributions).toHaveLength(4);

    const fieldMap = new Map(contribution?.contributions.map((c) => [c.fieldId, c.value]));
    expect(fieldMap.get('genre')).toBe('Pop, Rock');
    expect(fieldMap.get('style')).toBe('Pop Rock, Alternative Rock');
    expect(fieldMap.get('catalogNumber')).toBe('GEF-001');
    expect(fieldMap.get('masterRelease')).toBe('discogs:master:7890');
  });

  it('fetchContribution() handles empty queries gracefully returning null', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new DiscogsApiClient(pipeline);
    const adapter = new DiscogsAdapter(apiClient);

    const contribution = await adapter.fetchContribution({});
    expect(contribution).toBeNull();
  });

  it('searchAlbums() maps Discogs search results to domain AlbumMetadata[]', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new DiscogsApiClient(pipeline);
    const adapter = new DiscogsAdapter(apiClient);

    vi.spyOn(apiClient, 'searchReleases').mockResolvedValueOnce([
      {
        id: 999,
        title: 'Nirvana - Nevermind',
        year: '1991',
        genre: ['Rock'],
        cover_image: 'https://img.discogs.com/nevermind.jpg'
      }
    ]);

    const results = await adapter.searchAlbums('Nevermind', 'Nirvana', 5);
    expect(results).toHaveLength(1);
    expect(results[0].releaseId).toBe('999');
    expect(results[0].title).toBe('Nevermind');
    expect(results[0].artist).toBe('Nirvana');
    expect(results[0].provider).toBe('discogs');
  });

  it('resolveRelease() converts Discogs tracklist to domain ResolvedAlbumRelease', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new DiscogsApiClient(pipeline);
    const adapter = new DiscogsAdapter(apiClient);

    vi.spyOn(apiClient, 'getReleaseById').mockResolvedValueOnce({
      id: 999,
      title: 'Nevermind',
      artists: [{ name: 'Nirvana' }],
      year: 1991,
      genres: ['Rock'],
      images: [{ uri: 'https://img.discogs.com/front.jpg', type: 'primary' }],
      tracklist: [
        { position: '1', title: 'Smells Like Teen Spirit', duration: '5:01' },
        { position: '2', title: 'In Bloom', duration: '4:14' }
      ]
    });

    const resolved = await adapter.resolveRelease('999');
    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe('Nevermind');
    expect(resolved?.artist).toBe('Nirvana');
    expect(resolved?.tracks).toHaveLength(2);
    expect(resolved?.tracks[0].title).toBe('Smells Like Teen Spirit');
    expect(resolved?.tracks[0].duration).toBe(301);
  });
});
