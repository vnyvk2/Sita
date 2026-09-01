import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderResult } from '@main/metadata/models/ProviderResult';
import type {
  MetadataCandidate,
  RecordingMetadata,
  ProviderMetadata
} from '@main/metadata/models/RecordingMetadata';

import type { MusicBrainzRecordingDto } from '../dto/RecordingDto';

export class MusicBrainzRecordingMapper {
  public toCandidate(
    dto: MusicBrainzRecordingDto,
    confidence = 0.9,
    reasons: string[] = []
  ): MetadataCandidate {
    const artists =
      dto['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean) ?? [];
    const yearStr = dto['first-release-date'] ?? dto.releases?.[0]?.date;
    const parsedYear = yearStr ? parseInt(yearStr.split('-')[0], 10) : undefined;
    const year = isNaN(parsedYear!) ? undefined : parsedYear;

    const primaryRelease = dto.releases?.[0];
    const albumTitle = primaryRelease?.title;
    const primaryMedia = primaryRelease?.media?.[0];
    const trackInfo = primaryMedia?.track?.[0];

    const tags = dto.tags?.map((t) => t.name) ?? [];
    const genres = dto.genres?.map((g) => g.name) ?? [];
    const mergedGenres = Array.from(new Set([...genres, ...tags]));

    const recording: RecordingMetadata & { tags?: string[] } = {
      title: dto.title,
      artist: artists[0],
      artists,
      album: albumTitle,
      albumArtist: primaryRelease?.['artist-credit']?.[0]?.name,
      genres: mergedGenres,
      tags: mergedGenres,
      year,
      trackNumber: trackInfo?.number ? parseInt(trackInfo.number, 10) : undefined,
      totalTracks: primaryMedia?.['track-count'],
      discNumber: primaryMedia?.position,
      totalDiscs: primaryRelease?.['media-count'],
      duration: dto.length ? dto.length / 1000 : undefined
    };

    const provider: ProviderMetadata = {
      provider: 'musicbrainz',
      providerRecordingId: dto.id,
      providerReleaseId: primaryRelease?.id,
      providerArtistId: dto['artist-credit']?.[0]?.artist?.id,
      isrc: dto.isrcs?.[0],
      label: primaryRelease?.['label-info']?.[0]?.label?.name,
      releaseType: primaryRelease?.['release-group']?.['primary-type'],
      confidence,
      matchedBy: ['musicbrainz_recording_search'],
      reasons
    };

    return { recording, provider };
  }

  public toProviderResult(
    dto: MusicBrainzRecordingDto,
    confidence = 0.9
  ): ProviderResult<Record<string, unknown>> {
    const candidate = this.toCandidate(dto, confidence);
    const fields: Record<string, unknown> = {
      ...candidate.recording,
      ...candidate.provider,
      mbid: candidate.provider.providerRecordingId,
      musicBrainzRecordingId: candidate.provider.providerRecordingId,
      isrc: candidate.provider.isrc
    };

    return new ProviderResult({
      payload: fields,
      confidence: new MetadataConfidence(confidence),
      providerInfo: new MetadataProviderInfo({
        id: 'musicbrainz',
        displayName: 'MusicBrainz Provider',
        version: '1.0.0'
      })
    });
  }
}
