import { describe, expect, it, vi } from 'vitest';

import { RequestPipeline } from '../../../platform/networking/RequestPipeline';
import { IdentityResolutionCache } from '../../cache/IdentityResolutionCache';
import type { IMetadataProviderAdapter } from '../../contracts/IMetadataProviderAdapter';
import { ProviderCapabilities, ProviderCapability } from '../../contracts/ProviderCapabilities';
import { ProviderState } from '../../contracts/ProviderStatus';
import { TrackMatcher } from '../../matching/TrackMatcher';
import { MusicBrainzAdapter } from '../../providers/musicbrainz/MusicBrainzAdapter';
import { MusicBrainzApiClient } from '../../providers/musicbrainz/MusicBrainzApiClient';
import { MetadataProviderRuntime } from '../../runtime/MetadataProviderRuntime';
import { AlbumMetadataService, getConfidenceLevel } from '../AlbumMetadataService';

describe('Phase 3 Complete — Production-Grade Metadata Engine & Multi-Provider Runtime Suite', () => {
  it('maps confidence scores to confidence levels cleanly via getConfidenceLevel helper', () => {
    expect(getConfidenceLevel(1.0)).toBe('Excellent');
    expect(getConfidenceLevel(0.96)).toBe('Excellent');
    expect(getConfidenceLevel(0.92)).toBe('Very Good');
    expect(getConfidenceLevel(0.85)).toBe('Good');
    expect(getConfidenceLevel(0.72)).toBe('Review');
    expect(getConfidenceLevel(0.5)).toBe('Poor');
  });

  it('generates presentation-agnostic clean why match explanation strings without symbols', () => {
    const matcher = new TrackMatcher();
    const song = {
      songId: 1,
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      path: 'track.mp3',
      duration: 242
    };

    const track = {
      trackId: 't1',
      title: 'drivers license',
      artist: 'Olivia Rodrigo',
      album: 'SOUR',
      trackNumber: 1,
      duration: 242
    };

    const result = matcher.matchTracks([song], 'rel-sour', [track]);
    expect(result[0].why).toBe('Title Match | Artist Match | Album Match | Duration Match');
  });

  it('handles empty provider list gracefully returning empty array [] without throwing', async () => {
    const runtime = new MetadataProviderRuntime([]);
    await runtime.initialize();
    const service = new AlbumMetadataService(runtime);

    const albums = await service.search('SOUR', 'Olivia Rodrigo');
    expect(albums).toEqual([]);
  });

  it('tracks health status per provider independently in getProviderStatus', async () => {
    const failingAdapter: IMetadataProviderAdapter = {
      priority: 200,
      identity: {
        id: 'discogs',
        name: 'Discogs Provider',
        version: '1.0.0',
        providerType: 'online'
      },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn(),
      searchAlbums: vi.fn().mockRejectedValue(new Error('Rate limit exceeded'))
    };

    const successfulAdapter: IMetadataProviderAdapter = {
      priority: 100,
      identity: {
        id: 'musicbrainz',
        name: 'MusicBrainz Provider',
        version: '1.0.0',
        providerType: 'online'
      },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn(),
      searchAlbums: vi
        .fn()
        .mockResolvedValue([
          {
            title: 'SOUR',
            artist: 'Olivia Rodrigo',
            releaseId: 'mb-sour',
            provider: 'musicbrainz',
            year: 2021
          }
        ])
    };

    const runtime = new MetadataProviderRuntime([failingAdapter, successfulAdapter]);
    await runtime.initialize();
    const service = new AlbumMetadataService(runtime);

    const albums = await service.search('SOUR', 'Olivia Rodrigo');
    expect(albums).toHaveLength(1);

    const mbStatus = runtime.getProviderStatus('musicbrainz');
    const discogsStatus = runtime.getProviderStatus('discogs');

    expect(mbStatus?.state).toBe(ProviderState.Healthy);
    expect(discogsStatus?.consecutiveFailures).toBe(1);
  });

  it('prevents accidental duplicate provider registrations unless overwrite=true', () => {
    const adapter: IMetadataProviderAdapter = {
      identity: {
        id: 'musicbrainz',
        name: 'MusicBrainz Provider',
        version: '1.0.0',
        providerType: 'online'
      },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn()
    };

    const runtime = new MetadataProviderRuntime(adapter);
    expect(() => runtime.registerProvider(adapter)).toThrowError(/already registered/);
    expect(() => runtime.registerProvider(adapter, true)).not.toThrow();
  });

  it('preserves distinct release years during deduplication (title::artist::year)', async () => {
    const adapter: IMetadataProviderAdapter = {
      identity: {
        id: 'musicbrainz',
        name: 'MusicBrainz Provider',
        version: '1.0.0',
        providerType: 'online'
      },
      capabilities: new ProviderCapabilities([ProviderCapability.Search]),
      supports: () => true,
      lookup: vi.fn(),
      search: vi.fn(),
      searchAlbums: vi.fn().mockResolvedValue([
        { title: 'Greatest Hits', artist: 'Artist', year: 1995, releaseId: 'rel-1995' },
        { title: 'Greatest Hits', artist: 'Artist', year: 2005, releaseId: 'rel-2005' },
        { title: 'Greatest Hits', artist: 'Artist', year: 1995, releaseId: 'rel-dup' }
      ])
    };

    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();
    const service = new AlbumMetadataService(runtime);

    const albums = await service.search('Greatest Hits', 'Artist');
    // Keeps 1995 and 2005 distinct, deduplicates duplicate 1995
    expect(albums).toHaveLength(2);
    expect(albums.map((a) => a.year)).toEqual([1995, 2005]);
  });

  it('executes full end-to-end provider pipeline: search -> resolve -> cache hit -> build match', async () => {
    const pipeline = new RequestPipeline();
    const apiClient = new MusicBrainzApiClient(pipeline);
    const cache = new IdentityResolutionCache();
    const adapter = new MusicBrainzAdapter(apiClient, { cache });
    const runtime = new MetadataProviderRuntime(adapter);
    await runtime.initialize();

    const service = new AlbumMetadataService(runtime);

    // Mock API search releases
    vi.spyOn(apiClient, 'searchReleases').mockResolvedValueOnce([
      {
        id: 'mb-rel-sour',
        title: 'SOUR',
        date: '2021-05-21',
        status: 'Official',
        'artist-credit': [{ name: 'Olivia Rodrigo' }],
        media: [{ position: 1, 'track-count': 3 }]
      } as any
    ]);

    // Mock API get release details
    const getReleaseSpy = vi.spyOn(apiClient, 'getReleaseById').mockResolvedValue({
      id: 'mb-rel-sour',
      title: 'SOUR',
      date: '2021-05-21',
      status: 'Official',
      'artist-credit': [{ name: 'Olivia Rodrigo' }],
      media: [
        {
          position: 1,
          tracks: [
            { id: 't1', title: 'brutal', length: 203000, position: 1, recording: { id: 'rec-1' } },
            { id: 't2', title: 'traitor', length: 229000, position: 2, recording: { id: 'rec-2' } },
            {
              id: 't3',
              title: 'drivers license',
              length: 242000,
              position: 3,
              recording: { id: 'rec-3' }
            }
          ]
        }
      ]
    } as any);

    // 1. Search Albums
    const searchResults = await service.search('SOUR', 'Olivia Rodrigo');
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].releaseId).toBe('mb-rel-sour');
    expect(searchResults[0].provider).toBe('musicbrainz');

    // 2. Resolve Release Details
    const resolvedRelease = await service.resolveRelease(
      searchResults[0].releaseId!,
      searchResults[0].provider
    );
    expect(resolvedRelease).not.toBeNull();
    expect(resolvedRelease?.tracks).toHaveLength(3);
    expect(resolvedRelease?.providerReleaseId).toBe('mb-rel-sour');

    // 3. Resolve Release AGAIN (Assert Cache Hit)
    const secondResolved = await service.resolveRelease('mb-rel-sour', 'musicbrainz');
    expect(secondResolved).not.toBeNull();
    // getReleaseById should have been called only ONCE due to cache hit
    expect(getReleaseSpy).toHaveBeenCalledTimes(1);

    // 4. Build Album Match with Local Songs
    const localSongs = [
      { songId: 101, title: 'brutal', artist: 'Olivia Rodrigo', path: '01.mp3', duration: 203 },
      { songId: 102, title: 'traitor', artist: 'Olivia Rodrigo', path: '02.mp3', duration: 229 },
      {
        songId: 103,
        title: 'drivers license',
        artist: 'Olivia Rodrigo',
        path: '03.mp3',
        duration: 242
      }
    ];

    const preview = await service.buildAlbumMatch(
      localSongs,
      resolvedRelease!.album,
      resolvedRelease!.tracks
    );
    expect(preview.trackList).toHaveLength(3);
    expect(preview.confidence).toBeGreaterThanOrEqual(0.95);
    expect(preview.trackList[0].confidenceLevel).toBe('Excellent');
    expect(preview.trackList[0].remoteTrack.provider.providerRecordingId).toBe('rec-1');
  });
});
