import type { MetadataContext } from '../models/MetadataContext';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataKind } from '../models/MetadataKind';
import type { DefaultConflictPolicy } from '../policies/DefaultConflictPolicy';
import type { DefaultValidationPolicy } from '../policies/DefaultValidationPolicy';
import type { MetadataFieldRegistry } from '../registries/MetadataFieldRegistry';

export interface PipelineContextOptions<TDTO = unknown> {
  kind: MetadataKind;
  dto: TDTO;
  fieldRegistry: MetadataFieldRegistry;
  validationPolicy: DefaultValidationPolicy;
  conflictPolicy: DefaultConflictPolicy;
  existingEntity?: MetadataEntity | null;
  context?: MetadataContext;
}

export class PipelineContext<TDTO = unknown> {
  public readonly kind: MetadataKind;
  public readonly dto: TDTO;
  public readonly fieldRegistry: MetadataFieldRegistry;
  public readonly validationPolicy: DefaultValidationPolicy;
  public readonly conflictPolicy: DefaultConflictPolicy;
  public readonly existingEntity?: MetadataEntity | null;
  public readonly context?: MetadataContext;
  public entity: MetadataEntity | null = null;

  constructor(options: PipelineContextOptions<TDTO>) {
    this.kind = options.kind;
    this.dto = options.dto;
    this.fieldRegistry = options.fieldRegistry;
    this.validationPolicy = options.validationPolicy;
    this.conflictPolicy = options.conflictPolicy;
    this.existingEntity = options.existingEntity;
    this.context = options.context;
  }
}
