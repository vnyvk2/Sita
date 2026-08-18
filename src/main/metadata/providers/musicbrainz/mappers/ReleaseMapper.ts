import { ProviderResult } from '@main/metadata/models/ProviderResult';
import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import type { AlbumMetadata, OfficialTrackInput, ResolvedAlbumRelease } from '@main/metadata/models/RecordingMetadata';
import type { MusicBrainzReleaseDto } from '../dto/ReleaseDto';

export class MusicBrainzReleaseMapper {
  public toAlbumMetadata(dto: MusicBrainzReleaseDto, requestedArtist?: string): AlbumMetadata {
    const artistName =
      dto['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean).join(', ') ||
      requestedArtist ||
      'Unknown Artist';

    const year = dto.date ? parseInt(dto.date.substring(0, 4), 10) : undefined;
    const trackCount = dto.media?.reduce((acc, m) => acc + (m['track-count'] ?? m.tracks?.length ?? 0), 0) || undefined;

    return {
      title: dto.title,
      artist: artistName,
      year: isNaN(year!) ? undefined : year,
      label: dto['label-info']?.[0]?.label?.name,
      releaseType: dto['release-group']?.['primary-type'] ?? dto.status,
      discCount: dto.media?.length ?? 1,
      trackCount,
      releaseId: dto.id,
      releaseGroupId: dto['release-group']?.id,
      provider: 'musicbrainz'
    };
  }

  public toResolvedAlbumRelease(dto: MusicBrainzReleaseDto): ResolvedAlbumRelease {
    const album = this.toAlbumMetadata(dto);
    const officialTracks: OfficialTrackInput[] = [];

    if (dto.media) {
      for (const media of dto.media) {
        const discNumber = media.position ?? 1;
        if (media.tracks) {
          for (const track of media.tracks) {
            const trackNo = track.position ?? (track.number ? parseInt(track.number, 10) : officialTracks.length + 1);
            const trackArtist =
              track['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean).join(', ') ||
              album.artist;
            const duration = track.length ? track.length / 1000 : track.recording?.length ? track.recording.length / 1000 : undefined;

            officialTracks.push({
              trackId: track.id,
              title: track.title ?? track.recording?.title ?? '',
              artist: trackArtist,
              album: dto.title,
              year: album.year,
              trackNumber: isNaN(trackNo) ? officialTracks.length + 1 : trackNo,
              discNumber,
              duration,
              musicBrainzRecordingId: track.recording?.id,
              isrc: track.recording?.isrcs?.[0]
            });
          }
        }
      }
    }

    return {
      album,
      tracks: officialTracks,
      provider: 'musicbrainz',
      providerReleaseId: dto.id,
      releaseGroupId: dto['release-group']?.id
    };
  }

  public toProviderResult(dto: MusicBrainzReleaseDto): ProviderResult<Record<string, unknown>> {
    const album = this.toAlbumMetadata(dto);

    return new ProviderResult({
      payload: album as unknown as Record<string, unknown>,
      confidence: new MetadataConfidence(0.9),
      providerInfo: new MetadataProviderInfo({
        id: 'musicbrainz',
        displayName: 'MusicBrainz Provider',
        version: '1.0.0'
      })
    });
  }
}
