import type { IPipelineStage } from '../IPipelineStage';
import type { PipelineContext } from '../PipelineContext';

export class ConflictStage<TDTO = unknown> implements IPipelineStage<TDTO> {
  public readonly name = 'ConflictStage';

  public execute(context: PipelineContext<TDTO>): void {
    if (!context.entity || !context.existingEntity) return;

    for (const [fieldId, incomingValue] of Object.entries(context.entity.getAllFields())) {
      const existingValue = context.existingEntity.getField(fieldId);
      if (existingValue) {
        const resolved = context.conflictPolicy.resolve({
          fieldId,
          existingValue,
          incomingValue
        });
        context.entity.setField(fieldId, resolved);
      }
    }
  }
}
