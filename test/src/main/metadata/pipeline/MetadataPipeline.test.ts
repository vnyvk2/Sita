import { describe, expect, it } from 'vitest';

import { MetadataCache } from '@main/metadata/cache/MetadataCache';
import { MetadataEventBus } from '@main/metadata/events/MetadataEventBus';
import { MapperRegistry } from '@main/metadata/mappers/MapperRegistry';
import { CORE_FIELD_DEFINITIONS } from '@main/metadata/models/CoreFieldDefinitions';
import type { SongPersistenceDTO } from '@main/metadata/models/dtos';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataPipeline } from '@main/metadata/pipeline/MetadataPipeline';
import { DefaultConflictPolicy } from '@main/metadata/policies/DefaultConflictPolicy';
import { DefaultValidationPolicy } from '@main/metadata/policies/DefaultValidationPolicy';
import { MetadataFieldRegistry } from '@main/metadata/registries/MetadataFieldRegistry';

describe('MetadataPipeline', () => {
  it('should process DTO, validate fields, cache entity, and emit event', () => {
    const mapperRegistry = new MapperRegistry();
    const fieldRegistry = new MetadataFieldRegistry(CORE_FIELD_DEFINITIONS);
    const validationPolicy = new DefaultValidationPolicy();
    const conflictPolicy = new DefaultConflictPolicy();
    const cache = new MetadataCache();
    const eventBus = new MetadataEventBus();

    let createdEventFired = false;
    eventBus.on('MetadataCreated', () => {
      createdEventFired = true;
    });

    const pipeline = new MetadataPipeline({
      mapperRegistry,
      fieldRegistry,
      validationPolicy,
      conflictPolicy,
      cache,
      eventBus
    });

    const dto: SongPersistenceDTO = { id: 101, title: 'Comfortably Numb', year: 1979 };
    const entity = pipeline.processDTO(MetadataKinds.Song, dto);

    expect(entity).not.toBeNull();
    expect(entity?.getField<string>('title')?.value).toBe('Comfortably Numb');
    expect(cache.size()).toBe(1);
    expect(createdEventFired).toBe(true);
  });
});
