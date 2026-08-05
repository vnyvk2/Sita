import { describe, expect, it } from 'vitest';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import type { RequestPipeline } from '@main/platform/networking/RequestPipeline';
import { MetadataMatcher } from '../MetadataMatcher';
import { MusicBrainzAdapter } from '../MusicBrainzAdapter';
import { MusicBrainzApiClient } from '../MusicBrainzApiClient';
import type { MusicBrainzRecordingDto } from '../dto';

class MockRequestPipeline {
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

  public async execute<T>(options: any): Promise<{ data: T }> {
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

    const match = matcher.findBestMatch(target, [
      { id: '1', title: 'Bohemian Rhapsody (Live)', length: 360000, 'artist-credit': [{ name: 'Queen' }] },
      { id: '2', title: 'Bohemian Rhapsody', length: 354000, 'artist-credit': [{ name: 'Queen' }] }
    ]);

    expect(match).not.toBeNull();
    expect(match?.id).toBe('2');
  });

  it('performs lookup by query and maps RecordingDto to ProviderResult', async () => {
    const mockPipeline = new MockRequestPipeline();
    const apiClient = new MusicBrainzApiClient(mockPipeline as unknown as RequestPipeline);
    const adapter = new MusicBrainzAdapter(apiClient);

    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Song,
      entityId: 'test-song-1'
    });
    (identity as any).fields = { title: 'Bohemian Rhapsody', artist: 'Queen' };

    const result = await adapter.lookup(identity);

    expect(result).not.toBeNull();
    expect(result.providerInfo.id).toBe('musicbrainz');

    const payload = result.payload as any;
    expect(payload.title).toBe('Bohemian Rhapsody');
    expect(payload.artists).toEqual(['Queen']);
    expect(payload.album).toBe('A Night at the Opera');
    expect(payload.year).toBe(1975);
    expect(payload.tags).toContain('rock');
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
    const payload = result.payload as any;
    expect(payload.mbid).toBe('b10bbbfc-cf9e-42e0-be17-e2c3e1d52000');
    expect(payload.title).toBe('Bohemian Rhapsody');
  });
});
