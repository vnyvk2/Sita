import type { MetadataEntity } from '../models/MetadataEntity';

export interface MetadataFieldValueDTO {
  value: unknown;
  source?: string;
  confidence?: number;
}

export interface MetadataEntityDTO {
  identity: {
    entityKind: string;
    entityId: string | number;
  };
  fields: Record<string, MetadataFieldValueDTO>;
}

export class MetadataSnapshotSerializer {
  public static toDTO(entity: MetadataEntity): MetadataEntityDTO {
    const fieldsRecord: Record<string, MetadataFieldValueDTO> = {};
    for (const [fieldId, val] of Object.entries(entity.getAllFields())) {
      fieldsRecord[fieldId] = {
        value: val.value,
        source: val.source
          ? typeof val.source === 'string'
            ? val.source
            : val.source.type
          : undefined,
        confidence: val.confidence
          ? typeof val.confidence === 'number'
            ? val.confidence
            : val.confidence.score
          : undefined
      };
    }

    return {
      identity: {
        entityKind: entity.kind,
        entityId: entity.identity.entityId
      },
      fields: fieldsRecord
    };
  }
}
