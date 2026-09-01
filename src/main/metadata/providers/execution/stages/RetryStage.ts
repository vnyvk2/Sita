import type { ProviderResult } from '../../../models/ProviderResult';
import { ProviderRetryPolicy } from '../../retry/ProviderRetryPolicy';
import type { IProviderExecutionStage } from '../IProviderExecutionStage';
import type { ProviderExecutionStageContext } from '../ProviderExecutionStageContext';

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

    let lastResult: ProviderResult<TDTO> | undefined;

    try {
      return await this.retryPolicy.execute(
        async () => {
          lastResult = await next();
          const isCancelled =
            context.execContext?.cancellationToken?.isCancelled || lastResult.status === 'skipped';
          if (!isCancelled && (lastResult.status === 'failed' || lastResult.status === 'timeout')) {
            throw new Error(lastResult.error ?? `Provider result status: ${lastResult.status}`);
          }
          return lastResult;
        },
        {
          maxAttempts,
          baseDelayMs,
          backoffMultiplier,
          retryPredicate: (err: unknown) => {
            const isCancelled =
              context.execContext?.cancellationToken?.isCancelled ||
              (err as { name?: string })?.name === 'AbortError' ||
              (err as { code?: string })?.code === 'ABORT_ERR';
            return !isCancelled;
          },
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
      );
    } catch (_err) {
      if (lastResult) {
        return lastResult;
      }
      throw _err;
    }
  }
}
