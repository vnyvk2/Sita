import logger from '@main/logger';
import {
  convertToAlbum,
  convertToArtist,
  convertToGenre,
  convertToPlaylist,
  convertToSongData
} from '@main/utils/convert';

import type { MetadataEntity } from '../models/MetadataEntity';
import { MetadataKinds } from '../models/MetadataKind';

export class MetadataSearchResultMapper {
  public static mapEntityToDTO<TDTO = unknown>(entity: MetadataEntity): TDTO | null {
    if (!entity || !entity.rawPayload) return null;

    let dto: Record<string, unknown>;

    try {
      switch (entity.identity.entityKind) {
        case MetadataKinds.Song:
          dto = convertToSongData(entity.rawPayload as any) as any;
          break;
        case MetadataKinds.Artist:
          dto = convertToArtist(entity.rawPayload as any) as any;
          break;
        case MetadataKinds.Album:
          dto = convertToAlbum(entity.rawPayload as any) as any;
          break;
        case MetadataKinds.Playlist:
          dto = convertToPlaylist(entity.rawPayload as any) as any;
          break;
        case MetadataKinds.Genre:
          dto = convertToGenre(entity.rawPayload as any) as any;
          break;
        default:
          dto = { ...(entity.rawPayload as Record<string, unknown>) };
      }
    } catch (err) {
      logger.error(`Failed to map MetadataEntity to DTO for ${entity.identity.entityKind}:${entity.identity.entityId}`, {
        error: err
      });
      dto = { ...(entity.rawPayload as Record<string, unknown>) };
    }

    // Attach kind and id for SearchCoordinator indexing
    dto.kind = entity.identity.entityKind;
    dto.id = entity.identity.entityId;

    return dto as TDTO;
  }

  public static mapEntitiesToDTOs<TDTO = unknown>(entities: MetadataEntity[]): TDTO[] {
    return entities
      .map((entity) => this.mapEntityToDTO<TDTO>(entity))
      .filter((dto): dto is TDTO => dto !== null);
  }
}
