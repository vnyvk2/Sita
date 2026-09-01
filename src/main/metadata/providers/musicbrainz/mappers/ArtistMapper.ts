import { MetadataConfidence } from '@main/metadata/models/MetadataConfidence';
import { MetadataProviderInfo } from '@main/metadata/models/MetadataProviderInfo';
import { ProviderResult } from '@main/metadata/models/ProviderResult';

import type { MusicBrainzArtistDto } from '../dto/ArtistDto';

export class MusicBrainzArtistMapper {
  public toProviderResult(dto: MusicBrainzArtistDto): ProviderResult<Record<string, unknown>> {
    const fields: Record<string, unknown> = {
      name: dto.name,
      country: dto.country,
      type: dto.type,
      sortName: dto['sort-name'],
      aliases: dto.aliases?.map((a) => a.name) ?? [],
      tags: dto.tags?.map((t) => t.name) ?? []
    };

    return new ProviderResult({
      payload: fields,
      confidence: new MetadataConfidence(0.9),
      providerInfo: new MetadataProviderInfo({
        id: 'musicbrainz',
        displayName: 'MusicBrainz Provider',
        version: '1.0.0'
      })
    });
  }
}
