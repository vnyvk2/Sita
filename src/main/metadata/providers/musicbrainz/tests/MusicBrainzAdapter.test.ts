import { describe, expect, it } from 'vitest';
import { IdentityResolutionCache } from '@main/metadata/cache/IdentityResolutionCache';
import { MetadataMatcher } from '@main/metadata/matching/MetadataMatcher';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { MusicBrainzAdapter } from '../MusicBrainzAdapter';
import { MusicBrainzApiClient } from '../MusicBrainzApiClient';
import type { MusicBrainzRecordingDto, MusicBrainzReleaseDto } from '../dto';

class MockRequestPipeline {
  public lastParams?: any;
  public mockRecordings: MusicBrainzRecordingDto[] = [
    {
      id: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d52000',
      title: 'Bohemian Rhapsody',
      length: 354000,
      'artist-credit': [{ name: 'Queen' }],
      releases: [{ id: 'rel-1', title: 'A Night at the Opera', date: '1975-11-21' }],
      tags: [{ name: 'classic rock' }],
      genres: [{ name: 'rock' }]
    }
  ];

  public mockRelease: MusicBrainzReleaseDto = {
    id: '2b271a72-55fa-4861-9bfc-83142b97035d',
    title: 'SOUR',
    status: 'Official',
    date: '2021-05-21',
    'artist-credit': [{ name: 'Olivia Rodrigo' }],
    media: [
      {
        position: 1,
        'track-count': 2,
        tracks: [
          { id: 't1', position: 1, number: '1', title: 'brutal', length: 143000 },
          { id: 't2', position: 2, number: '2', title: 'traitor', length: 229000 }
        ]
      }
    ]
  };

  public async execute<T>(options: any): Promise<{ data: T }> {
    this.lastParams = options.params;
    if (options.url.includes('/release/2b271a72-55fa-4861-9bfc-83142b97035d')) {
      return { data: this.mockRelease as unknown as T };
    }
    if (options.url.includes('/recording/b10bbbfc-cf9e-42e0-be17-e2c3e1d52000')) {
      return { data: this.mockRecordings[0] as unknown as T };
    }
    return {
      data: {
        recordings: this.mockRecordings,
        count: this.mockRecordings.length,
        offset: 0,
        created: new Date().toISOString()
      } as unknown as T
    };
  }
}

describe('MusicBrainz — End-to-End Adapter & Candidate Matching', () => {
  it('correctly scores and selects best candidate using MetadataMatcher', () => {
    const matcher = new MetadataMatcher(0.3);
    const target = { title: 'Bohemian Rhapsody', artist: 'Queen', durationSeconds: 354 };

    const matchResult = matcher.findBestMatch(target, [
      { id: '1', title: 'Bohemian Rhapsody (Live)', durationSeconds: 360, artists: ['Queen'] },
      { id: '2', title: 'Bohemian Rhapsody', durationSeconds: 354, artists: ['Queen'] }
    ]);

    expect(matchResult).not.toBeNull();
    expect(matchResult?.candidate.id).toBe('2');
    expect(matchResult?.score).toBeGreaterThan(0.5);
  });

  it('performs lookup by query and maps RecordingDto to ProviderResult with match confidence', async () => {
    const mockPipeline = new MockRequestPipeline();
    const apiClient = new MusicBrainzApiClient(mockPipeline as unknown as RequestPipeline);
    const cache = new IdentityResolutionCache();
    const adapter = new MusicBrainzAdapter(apiClient, { cache });

    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Song,
      entityId: 'test-song-1',
      fields: { title: 'Bohemian Rhapsody', artist: 'Queen' }
    });

    const result = await adapter.lookup(identity);

    expect(result).not.toBeNull();
    expect(result.providerInfo.id).toBe('musicbrainz');
    expect(result.confidence).toBeGreaterThan(0.5);

    const payload = result.payload as any;
    expect(payload.title).toBe('Bohemian Rhapsody');
    expect(payload.artists).toEqual(['Queen']);
    expect(payload.album).toBe('A Night at the Opera');
    expect(payload.year).toBe(1975);
    expect(payload.tags).toContain('rock');

    // Verify MBID was cached in IdentityResolutionCache
    expect(cache.get<string>('musicbrainz', 'Bohemian Rhapsody:Queen')).toBe('b10bbbfc-cf9e-42e0-be17-e2c3e1d52000');
  });

  it('performs direct MBID lookup when entityId is UUID', async () => {
    const mockPipeline = new MockRequestPipeline();
    const apiClient = new MusicBrainzApiClient(mockPipeline as unknown as RequestPipeline);
    const adapter = new MusicBrainzAdapter(apiClient);

    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Song,
      entityId: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d52000'
    });

    const result = await adapter.lookup(identity);

    expect(result).not.toBeNull();
    expect(result.confidence).toBe(1.0);
    const payload = result.payload as any;
    expect(payload.mbid).toBe('b10bbbfc-cf9e-42e0-be17-e2c3e1d52000');
    expect(payload.title).toBe('Bohemian Rhapsody');
  });

  it('resolves release details without invalid inc parameters', async () => {
    const mockPipeline = new MockRequestPipeline();
    const apiClient = new MusicBrainzApiClient(mockPipeline as unknown as RequestPipeline);
    const adapter = new MusicBrainzAdapter(apiClient);

    const resolved = await adapter.resolveRelease('2b271a72-55fa-4861-9bfc-83142b97035d');

    expect(resolved).not.toBeNull();
    expect(resolved?.album.title).toBe('SOUR');
    expect(resolved?.tracks).toHaveLength(2);
    expect(mockPipeline.lastParams?.inc).not.toContain('record-level-relations');
    expect(mockPipeline.lastParams?.inc).toContain('artists recordings release-groups media discids tags genres');
  });
});
