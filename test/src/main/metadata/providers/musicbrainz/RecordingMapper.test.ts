import { describe, expect, it } from 'vitest';
import { MusicBrainzRecordingMapper } from '@main/metadata/providers/musicbrainz/mappers/RecordingMapper';
import { MusicBrainzReleaseMapper } from '@main/metadata/providers/musicbrainz/mappers/ReleaseMapper';
import type { MusicBrainzRecordingDto } from '@main/metadata/providers/musicbrainz/dto/RecordingDto';
import type { MusicBrainzReleaseDto } from '@main/metadata/providers/musicbrainz/dto/ReleaseDto';

describe('MusicBrainz Recording & Release Mappers (Phase 4 Identity)', () => {
  it('MusicBrainzRecordingMapper maps recording.id to providerRecordingId/musicBrainzRecordingId and isrcs[0] to isrc', () => {
    const mapper = new MusicBrainzRecordingMapper();
    const dto: MusicBrainzRecordingDto = {
      id: 'rec-mbid-uuid-1234',
      title: 'Creep',
      length: 238000,
      'first-release-date': '1992-09-21',
      isrcs: ['GBAYE9200070', 'USCA29200001'],
      'artist-credit': [{ name: 'Radiohead', artist: { id: 'art-mbid-1' } }],
      releases: [
        {
          id: 'rel-mbid-999',
          title: 'Pablo Honey',
          'release-group': { id: 'rg-mbid-777', 'primary-type': 'Album' }
        }
      ]
    };

    const candidate = mapper.toCandidate(dto, 0.95);
    expect(candidate.provider.providerRecordingId).toBe('rec-mbid-uuid-1234');
    expect(candidate.provider.isrc).toBe('GBAYE9200070');

    const providerResult = mapper.toProviderResult(dto, 0.95);
    expect((providerResult.payload as any).musicBrainzRecordingId).toBe('rec-mbid-uuid-1234');
    expect((providerResult.payload as any).isrc).toBe('GBAYE9200070');
  });

  it('MusicBrainzReleaseMapper maps track.recording.id and track.recording.isrcs to OfficialTrackInput', () => {
    const mapper = new MusicBrainzReleaseMapper();
    const dto: MusicBrainzReleaseDto = {
      id: 'rel-mbid-555',
      title: 'Pablo Honey',
      date: '1993-02-22',
      'release-group': { id: 'rg-mbid-777' },
      'artist-credit': [{ name: 'Radiohead' }],
      media: [
        {
          position: 1,
          'track-count': 1,
          tracks: [
            {
              id: 'trk-1',
              position: 1,
              title: 'You',
              length: 208000,
              recording: {
                id: 'rec-track-mbid-0001',
                title: 'You',
                isrcs: ['GBAYE9300001']
              }
            }
          ]
        }
      ]
    };

    const resolved = mapper.toResolvedAlbumRelease(dto);
    expect(resolved.tracks).toHaveLength(1);
    const track = resolved.tracks[0];
    expect(track.musicBrainzRecordingId).toBe('rec-track-mbid-0001');
    expect(track.isrc).toBe('GBAYE9300001');
  });

  it('MusicBrainzReleaseMapper falls back to track.isrc when track.recording.isrcs is not present', () => {
    const mapper = new MusicBrainzReleaseMapper();
    const dto: MusicBrainzReleaseDto = {
      id: 'rel-mbid-666',
      title: 'Pablo Honey',
      date: '1993-02-22',
      'release-group': { id: 'rg-mbid-777' },
      'artist-credit': [{ name: 'Radiohead' }],
      media: [
        {
          position: 1,
          'track-count': 1,
          tracks: [
            {
              id: 'trk-2',
              position: 1,
              title: 'Creep',
              length: 238000,
              isrc: 'GBAYE9300002',
              recording: {
                id: 'rec-track-mbid-0002',
                title: 'Creep'
              }
            }
          ]
        }
      ]
    };

    const resolved = mapper.toResolvedAlbumRelease(dto);
    expect(resolved.tracks[0].isrc).toBe('GBAYE9300002');
    expect(resolved.tracks[0].musicBrainzRecordingId).toBe('rec-track-mbid-0002');
  });
});
