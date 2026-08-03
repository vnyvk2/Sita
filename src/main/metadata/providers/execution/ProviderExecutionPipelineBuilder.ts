import type { ProviderCircuitBreakerRegistry } from '../circuitbreaker/ProviderCircuitBreakerRegistry';
import type { ProviderRetryPolicy } from '../retry/ProviderRetryPolicy';
import type { ProviderTimeoutPolicy } from '../timeout/ProviderTimeoutPolicy';
import type { IProviderExecutionStage } from './IProviderExecutionStage';

import { CircuitBreakerStage } from './stages/CircuitBreakerStage';
import { RetryStage } from './stages/RetryStage';
import { TimeoutStage } from './stages/TimeoutStage';
import { ProviderExecutionPipeline } from './ProviderExecutionPipeline';

export class ProviderExecutionPipelineBuilder {
  private readonly stages: IProviderExecutionStage[] = [];

  public withCircuitBreaker(circuitBreakerRegistry?: ProviderCircuitBreakerRegistry): this {
    this.stages.push(new CircuitBreakerStage(circuitBreakerRegistry));
    return this;
  }

  public withRetry(retryPolicy?: ProviderRetryPolicy): this {
    this.stages.push(new RetryStage(retryPolicy));
    return this;
  }

  public withTimeout(timeoutPolicy?: ProviderTimeoutPolicy): this {
    this.stages.push(new TimeoutStage(timeoutPolicy));
    return this;
  }

  public addStage(stage: IProviderExecutionStage): this {
    this.stages.push(stage);
    return this;
  }

  public build(): ProviderExecutionPipeline {
    return new ProviderExecutionPipeline([...this.stages]);
  }
}
