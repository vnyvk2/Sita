import type { AlbumPersistenceDTO } from '../models/dtos';
import type { IMetadataMapper } from './IMetadataMapper';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataEntity } from '../models/MetadataEntity';
import { MetadataFields } from '../models/MetadataFieldId';
import { MetadataIdentity } from '../models/MetadataIdentity';
import { MetadataKinds } from '../models/MetadataKind';
import { MetadataSource, MetadataSourceTypes } from '../models/MetadataSource';
import { MetadataValue } from '../models/MetadataValue';

export class AlbumMapper implements IMetadataMapper<AlbumPersistenceDTO> {
  public readonly kind = MetadataKinds.Album;

  public map(dto: AlbumPersistenceDTO): MetadataEntity {
    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Album,
      entityId: dto.id
    });

    const source = new MetadataSource({ type: MetadataSourceTypes.LocalTags });
    const confidence = MetadataConfidence.verified();

    const entity = new MetadataEntity({ identity, rawPayload: dto });

    if (dto.title) {
      entity.setField(
        MetadataFields.Album,
        new MetadataValue<string>({ value: dto.title, source, confidence })
      );
    }

    if (dto.artists && dto.artists.length > 0) {
      const artistNames = dto.artists.map((a) => a.artist.name).filter(Boolean);
      if (artistNames.length > 0) {
        entity.setField(
          MetadataFields.Artist,
          new MetadataValue<string[]>({ value: artistNames, source, confidence })
        );
      }
    }

    return entity;
  }
}
