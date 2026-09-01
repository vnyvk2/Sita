import { MapperRegistry } from '@main/metadata/mappers/MapperRegistry';
import { CORE_FIELD_DEFINITIONS } from '@main/metadata/models/CoreFieldDefinitions';
import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataPipeline } from '@main/metadata/pipeline/MetadataPipeline';
import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';
import { describe, expect, it } from 'vitest';

describe('MetadataPipeline', () => {
  it('should process DTO into MetadataEntity deterministically using pipeline stages', async () => {
    const mapperRegistry = new MapperRegistry();
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const validationPolicy = new DefaultValidationPolicy();
    const conflictPolicy = new DefaultConflictPolicy();

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy,
      conflictPolicy
    });

    const dto: SongPersistenceDTO = { id: 101, title: 'Comfortably Numb', year: 1979 };
    const entity = await pipeline.processDTO(MetadataKinds.Song, dto);

    expect(entity).not.toBeNull();
    expect(entity?.getField<string>('title')?.value).toBe('Comfortably Numb');
    expect(entity?.getField<number>('year')?.value).toBe(1979);
  });
});
