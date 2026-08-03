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
    const maxAttempts = context.config.maxRetries;
    const baseDelayMs = context.config.baseDelayMs;
    const backoffMultiplier = context.config.backoffMultiplier;

    return this.retryPolicy.execute(
      async () => {
        const result = await next();
        if (result.status === 'failed' || result.status === 'timeout') {
          throw new Error(result.error ?? `Provider result status: ${result.status}`);
        }
        return result;
      },
      {
        maxAttempts,
        baseDelayMs,
        backoffMultiplier,
        retryPredicate: () => true,
        onRetry: (attempt, maxAttemptsCount, delayMs, error) => {
          context.eventBus.emit('ProviderRetry', {
            providerInfo: context.provider.info,
            attempt,
            maxAttempts: maxAttemptsCount,
            delayMs,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    ).catch(async (finalErr) => {
      // Return the final failed ProviderResult after retries are exhausted
      return next();
    });
  }
}
