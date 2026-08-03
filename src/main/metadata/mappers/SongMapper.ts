import type { SongPersistenceDTO } from '../models/dtos';
import type { IMetadataMapper } from './IMetadataMapper';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { MetadataEntity } from '../models/MetadataEntity';
import { MetadataFields } from '../models/MetadataFieldId';
import { MetadataIdentity } from '../models/MetadataIdentity';
import { MetadataKinds } from '../models/MetadataKind';
import { MetadataSource, MetadataSourceTypes } from '../models/MetadataSource';
import { MetadataValue } from '../models/MetadataValue';

export class SongMapper implements IMetadataMapper<SongPersistenceDTO> {
  public readonly kind = MetadataKinds.Song;

  public map(dto: SongPersistenceDTO): MetadataEntity {
    const identity = new MetadataIdentity({
      entityKind: MetadataKinds.Song,
      entityId: dto.id
    });

    const source = new MetadataSource({ type: MetadataSourceTypes.LocalTags });
    const confidence = MetadataConfidence.verified();

    const entity = new MetadataEntity({ identity });

    if (dto.title) {
      entity.setField(
        MetadataFields.Title,
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

    if (dto.albums && dto.albums.length > 0) {
      const albumTitles = dto.albums.map((a) => a.album.title).filter(Boolean);
      if (albumTitles.length > 0) {
        entity.setField(
          MetadataFields.Album,
          new MetadataValue<string>({ value: albumTitles[0], source, confidence })
        );
      }
    }

    if (dto.genres && dto.genres.length > 0) {
      const genreNames = dto.genres.map((g) => g.genre.name).filter(Boolean);
      if (genreNames.length > 0) {
        entity.setField(
          MetadataFields.Genre,
          new MetadataValue<string[]>({ value: genreNames, source, confidence })
        );
      }
    }

    if (dto.year != null) {
      entity.setField(
        MetadataFields.Year,
        new MetadataValue<number>({ value: dto.year, source, confidence })
      );
    }

    return entity;
  }
}
