import type { ProviderResult } from '../../../models/ProviderResult';
import type { IProviderExecutionStage } from '../IProviderExecutionStage';
import type { ProviderExecutionStageContext } from '../ProviderExecutionStageContext';

import { ProviderRetryPolicy } from '../../retry/ProviderRetryPolicy';

export class RetryStage implements IProviderExecutionStage {
  public readonly name = 'RetryStage';
  private readonly retryPolicy: ProviderRetryPolicy;

  constructor(retryPolicy?: ProviderRetryPolicy) {
    this.retryPolicy = retryPolicy ?? new ProviderRetryPolicy();
  }

  public async execute<TDTO = unknown>(
    context: ProviderExecutionStageContext<TDTO>,
    next: () => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>> {
    const maxAttempts = context.config?.maxRetries ?? 2;
    const baseDelayMs = context.config?.baseDelayMs ?? 100;
    const backoffMultiplier = context.config?.backoffMultiplier ?? 2;

    return this.retryPolicy.execute(
      async () => {
        return next();
      },
      {
        maxAttempts,
        baseDelayMs,
        backoffMultiplier,
        retryPredicate: (err) => err !== undefined,
        onRetry: (attempt, maxAttempts, delayMs, error) => {
          context.eventBus.emit('ProviderRetry', {
            providerInfo: context.provider.info,
            attempt,
            maxAttempts,
            delayMs,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    );
  }
}
