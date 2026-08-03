import type { MetadataCache } from '../cache/MetadataCache';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { MapperRegistry } from '../mappers/MapperRegistry';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataKind } from '../models/MetadataKind';
import type { DefaultConflictPolicy } from '../policies/DefaultConflictPolicy';
import type { DefaultValidationPolicy } from '../policies/DefaultValidationPolicy';
import type { MetadataFieldRegistry } from '../registries/MetadataFieldRegistry';

export interface MetadataPipelineOptions {
  mapperRegistry: MapperRegistry;
  fieldRegistry: MetadataFieldRegistry;
  validationPolicy: DefaultValidationPolicy;
  conflictPolicy: DefaultConflictPolicy;
  cache: MetadataCache;
  eventBus: MetadataEventBus;
}

export class MetadataPipeline {
  private readonly mapperRegistry: MapperRegistry;
  private readonly fieldRegistry: MetadataFieldRegistry;
  private readonly validationPolicy: DefaultValidationPolicy;
  private readonly conflictPolicy: DefaultConflictPolicy;
  private readonly cache: MetadataCache;
  private readonly eventBus: MetadataEventBus;

  constructor(options: MetadataPipelineOptions) {
    this.mapperRegistry = options.mapperRegistry;
    this.fieldRegistry = options.fieldRegistry;
    this.validationPolicy = options.validationPolicy;
    this.conflictPolicy = options.conflictPolicy;
    this.cache = options.cache;
    this.eventBus = options.eventBus;
  }

  public processDTO<TDTO>(kind: MetadataKind, dto: TDTO): MetadataEntity | null {
    const mapper = this.mapperRegistry.get<TDTO>(kind);
    if (!mapper) {
      return null;
    }

    const entity = mapper.map(dto);

    // Validate fields against FieldRegistry definitions
    for (const [fieldId, val] of Object.entries(entity.getAllFields())) {
      const fieldDef = this.fieldRegistry.get(fieldId);
      if (fieldDef) {
        const validation = this.validationPolicy.validate(fieldDef, val.value);
        if (!validation.valid) {
          entity.removeField(fieldId);
        }
      }
    }

    // Check existing entity in cache for conflict resolution
    const existing = this.cache.get(entity.identity);
    if (existing) {
      for (const [fieldId, incomingValue] of Object.entries(entity.getAllFields())) {
        const existingValue = existing.getField(fieldId);
        if (existingValue) {
          const resolved = this.conflictPolicy.resolve({
            fieldId,
            existingValue,
            incomingValue
          });
          entity.setField(fieldId, resolved);
        }
      }
    }

    // Cache processed entity
    this.cache.set(entity);

    // Emit metadata lifecycle event
    if (existing) {
      this.eventBus.emit('MetadataChanged', {
        identity: entity.identity,
        entity,
        changedFields: Object.keys(entity.getAllFields())
      });
    } else {
      this.eventBus.emit('MetadataCreated', {
        identity: entity.identity,
        entity
      });
    }

    return entity;
  }
}
