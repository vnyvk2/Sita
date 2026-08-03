import type { MetadataEntity } from '../models/MetadataEntity';

export class MetadataSearchResultMapper {
  public static mapEntityToDTO<TDTO = unknown>(entity: MetadataEntity): TDTO | null {
    if (!entity) return null;

    const dto: Record<string, unknown> = {
      id: entity.identity.entityId,
      kind: entity.identity.entityKind
    };

    const fields = entity.getAllFields();
    for (const [key, fieldVal] of Object.entries(fields)) {
      if (fieldVal && fieldVal.value !== undefined) {
        dto[key] = fieldVal.value;
      }
    }

    return dto as TDTO;
  }

  public static mapEntitiesToDTOs<TDTO = unknown>(entities: MetadataEntity[]): TDTO[] {
    return entities
      .map((entity) => this.mapEntityToDTO<TDTO>(entity))
      .filter((dto): dto is TDTO => dto !== null);
  }
}
