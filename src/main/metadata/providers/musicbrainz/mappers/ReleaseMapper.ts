import { ProviderResult } from '@main/metadata/models/ProviderResult';
import type { MusicBrainzReleaseDto } from '../dto/ReleaseDto';

export class MusicBrainzReleaseMapper {
  public toProviderResult(dto: MusicBrainzReleaseDto): ProviderResult<Record<string, unknown>> {
    const artists = dto['artist-credit']?.map((ac) => ac.name ?? ac.artist?.name ?? '').filter(Boolean) ?? [];
    const year = dto.date ? parseInt(dto.date.split('-')[0], 10) : undefined;

    const fields: Record<string, unknown> = {
      title: dto.title,
      artists,
      year: isNaN(year!) ? undefined : year,
      country: dto.country,
      status: dto.status,
      barcode: dto.barcode,
      primaryType: dto['release-group']?.['primary-type']
    };

    return new ProviderResult({
      payload: fields,
      confidence: 0.9,
      providerInfo: {
        id: 'musicbrainz',
        name: 'MusicBrainz Provider',
        version: '1.0.0'
      }
    });
  }
}
