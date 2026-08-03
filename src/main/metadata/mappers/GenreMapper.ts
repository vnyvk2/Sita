import type { GenrePersistenceDTO } from '../models/dtos';
import type { IMetadataMapper } from './IMetadataMapper';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataEntity } from '../models/MetadataEntity';
import { MetadataFields } from '../models/MetadataFieldId';
import { MetadataIdentity } from '../models/MetadataIdentity';
import { MetadataKinds } from '../models/MetadataKind';
import { MetadataSource, MetadataSourceTypes } from '../models/MetadataSource';
import { MetadataValue } from '../models/MetadataValue';

export class GenreMapper implements IMetadataMapper<GenrePersistenceDTO> {
  public readonly kind = MetadataKinds.Genre;

  public map(dto: GenrePersistenceDTO): MetadataEntity {
    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Genre,
      entityId: dto.id
    });

    const source = new MetadataSource({ type: MetadataSourceTypes.LocalTags });
    const confidence = MetadataConfidence.verified();

    const entity = new MetadataEntity({ identity });

    if (dto.name) {
      entity.setField(
        MetadataFields.Genre,
        new MetadataValue<string>({ value: dto.name, source, confidence })
      );
    }

    return entity;
  }
}
