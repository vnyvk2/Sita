import { ProviderResult } from '@main/metadata/models/ProviderResult';
import type { MusicBrainzRecordingDto } from '../dto/RecordingDto';

export class MusicBrainzRecordingMapper {
  public toProviderResult(
    dto: MusicBrainzRecordingDto,
    confidence = 0.9
  ): ProviderResult<Record<string, unknown>> {
    const artists = dto['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean) ?? [];
    const yearStr = dto['first-release-date'] ?? dto.releases?.[0]?.date;
    const year = yearStr ? parseInt(yearStr.split('-')[0], 10) : undefined;
    const albumTitle = dto.releases?.[0]?.title;

    const tags = dto.tags?.map((t) => t.name) ?? [];
    const genres = dto.genres?.map((g) => g.name) ?? [];
    const mergedTags = Array.from(new Set([...tags, ...genres]));

    const fields: Record<string, unknown> = {
      title: dto.title,
      artists,
      album: albumTitle,
      duration: dto.length ? dto.length / 1000 : undefined,
      year: isNaN(year!) ? undefined : year,
      tags: mergedTags,
      isrcs: dto.isrcs ?? [],
      mbid: dto.id
    };

    return new ProviderResult({
      payload: fields,
      confidence,
      providerInfo: {
        id: 'musicbrainz',
        name: 'MusicBrainz Provider',
        version: '1.0.0'
      }
    });
  }
}
