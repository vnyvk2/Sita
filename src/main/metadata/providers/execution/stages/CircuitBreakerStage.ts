import type { ProviderResult } from '../../../models/ProviderResult';
import type { IProviderExecutionStage } from '../IProviderExecutionStage';
import type { ProviderExecutionStageContext } from '../ProviderExecutionStageContext';

import { MetadataConfidence } from '../../../models/MetadataConfidence';
import { ProviderResult as ConcreteProviderResult } from '../../../models/ProviderResult';
import { ProviderCircuitBreaker } from '../../circuitbreaker/ProviderCircuitBreaker';

export class CircuitBreakerStage implements IProviderExecutionStage {
  public readonly name = 'CircuitBreakerStage';
  private readonly breakers: Map<string, ProviderCircuitBreaker> = new Map();

  public getCircuitBreaker(providerId: string, context: ProviderExecutionStageContext): ProviderCircuitBreaker {
    let breaker = this.breakers.get(providerId);
    if (!breaker) {
      breaker = new ProviderCircuitBreaker(providerId, context.eventBus, {
        failureThreshold: context.config?.circuitBreakerFailureThreshold,
        cooldownMs: context.config?.circuitBreakerCooldownMs
      });
      this.breakers.set(providerId, breaker);
    }
    return breaker;
  }

  public async execute<TDTO = unknown>(
    context: ProviderExecutionStageContext<TDTO>,
    next: () => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>> {
    const breaker = this.getCircuitBreaker(context.provider.info.id, context as unknown as ProviderExecutionStageContext);

    if (!breaker.isCallAllowed()) {
      context.eventBus.emit('ProviderSkipped', {
        providerInfo: context.provider.info,
        identity: context.identity,
        status: 'skipped',
        latencyMs: 0,
        error: 'Circuit breaker is open'
      });

      return new ConcreteProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: context.provider.info,
        latencyMs: 0,
        status: 'skipped',
        error: 'Circuit breaker is open'
      });
    }

    try {
      const result = await next();
      if (result.status === 'success') {
        breaker.onSuccess();
      } else if (result.status === 'failed' || result.status === 'timeout') {
        breaker.onFailure(result.error);
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      breaker.onFailure(errorMsg);
      throw err;
    }
  }
}
