import type { IPipelineStage } from '../IPipelineStage';
import type { PipelineContext } from '../PipelineContext';

export class ValidationStage<TDTO = unknown> implements IPipelineStage<TDTO> {
  public readonly name = 'ValidationStage';

  public execute(context: PipelineContext<TDTO>): void {
    if (!context.entity) return;

    for (const [fieldId, val] of Object.entries(context.entity.getAllFields())) {
      const fieldDef = context.fieldRegistry.get(fieldId);
      if (fieldDef) {
        const validation = context.validationPolicy.validate(fieldDef, val.value);
        if (!validation.valid) {
          context.entity.removeField(fieldId);
        }
      }
    }
  }
}
