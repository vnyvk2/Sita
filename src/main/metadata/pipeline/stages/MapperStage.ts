import type { MapperRegistry } from '../../mappers/MapperRegistry';
import type { IPipelineStage } from '../IPipelineStage';
import type { PipelineContext } from '../PipelineContext';

export class MapperStage<TDTO = unknown> implements IPipelineStage<TDTO> {
  public readonly name = 'MapperStage';
  private readonly mapperRegistry: MapperRegistry;

  constructor(mapperRegistry: MapperRegistry) {
    this.mapperRegistry = mapperRegistry;
  }

  public execute(context: PipelineContext<TDTO>): void {
    const mapper = this.mapperRegistry.get<TDTO>(context.kind);
    if (mapper) {
      context.entity = mapper.map(context.dto);
    }
  }
}
