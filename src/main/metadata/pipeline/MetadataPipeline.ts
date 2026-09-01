import type { MapperRegistry } from '../mappers/MapperRegistry';
import type { MetadataContext } from '../models/MetadataContext';
import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataKind } from '../models/MetadataKind';
import type { DefaultConflictPolicy } from '../policies/DefaultConflictPolicy';
import type { DefaultValidationPolicy } from '../policies/DefaultValidationPolicy';
import type { MetadataFieldRegistry } from '../registries/MetadataFieldRegistry';
import type { IPipelineStage } from './IPipelineStage';
import { PipelineContext } from './PipelineContext';
import { ConflictStage } from './stages/ConflictStage';
import { MapperStage } from './stages/MapperStage';
import { ValidationStage } from './stages/ValidationStage';

export interface MetadataPipelineOptions {
  mapperRegistry: MapperRegistry;
  fieldRegistry: MetadataFieldRegistry;
  validationPolicy: DefaultValidationPolicy;
  conflictPolicy: DefaultConflictPolicy;
  context?: MetadataContext;
  stages?: IPipelineStage[];
}

export class MetadataPipeline {
  private readonly mapperRegistry: MapperRegistry;
  private readonly fieldRegistry: MetadataFieldRegistry;
  private readonly validationPolicy: DefaultValidationPolicy;
  private readonly conflictPolicy: DefaultConflictPolicy;
  private readonly context?: MetadataContext;
  private readonly stages: IPipelineStage[];

  constructor(options: MetadataPipelineOptions) {
    this.mapperRegistry = options.mapperRegistry;
    this.fieldRegistry = options.fieldRegistry;
    this.validationPolicy = options.validationPolicy;
    this.conflictPolicy = options.conflictPolicy;
    this.context = options.context;

    this.stages = options.stages ?? [
      new MapperStage(this.mapperRegistry),
      new ValidationStage(),
      new ConflictStage()
    ];
  }

  public async processDTO<TDTO>(
    kind: MetadataKind,
    dto: TDTO,
    existingEntity?: MetadataEntity | null
  ): Promise<MetadataEntity | null> {
    const pipelineContext = new PipelineContext<TDTO>({
      kind,
      dto,
      fieldRegistry: this.fieldRegistry,
      validationPolicy: this.validationPolicy,
      conflictPolicy: this.conflictPolicy,
      existingEntity,
      context: this.context
    });

    for (const stage of this.stages) {
      await stage.execute(pipelineContext);
    }

    return pipelineContext.entity;
  }
}
