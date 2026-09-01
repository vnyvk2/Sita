import type { ProviderResult } from '../../models/ProviderResult';
import type { IProviderExecutionStage } from './IProviderExecutionStage';
import type { ProviderExecutionStageContext } from './ProviderExecutionStageContext';
import { CircuitBreakerStage } from './stages/CircuitBreakerStage';
import { RetryStage } from './stages/RetryStage';
import { TimeoutStage } from './stages/TimeoutStage';

export class ProviderExecutionPipeline {
  private readonly stages: IProviderExecutionStage[];

  constructor(stages?: IProviderExecutionStage[]) {
    this.stages = stages ?? [new CircuitBreakerStage(), new RetryStage(), new TimeoutStage()];
  }

  public async process<TDTO = unknown>(
    context: ProviderExecutionStageContext<TDTO>
  ): Promise<ProviderResult<TDTO>> {
    const dispatch = async (i: number): Promise<ProviderResult<TDTO>> => {
      if (i >= this.stages.length) {
        const res = await context.action(context.provider, context.identity, context.execContext);
        return res as ProviderResult<TDTO>;
      }

      const stage = this.stages[i];
      return stage.execute(context, () => dispatch(i + 1));
    };

    return dispatch(0);
  }
}
