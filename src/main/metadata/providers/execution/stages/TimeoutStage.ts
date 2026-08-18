import type { ProviderResult } from '../../../models/ProviderResult';
import type { IProviderExecutionStage } from '../IProviderExecutionStage';
import type { ProviderExecutionStageContext } from '../ProviderExecutionStageContext';

import { MetadataConfidence } from '../../../models/MetadataConfidence';
import { ProviderResult as ConcreteProviderResult } from '../../../models/ProviderResult';
import { ProviderTimeoutPolicy } from '../../timeout/ProviderTimeoutPolicy';

export class TimeoutStage implements IProviderExecutionStage {
  public readonly name = 'TimeoutStage';
  private readonly timeoutPolicy: ProviderTimeoutPolicy;

  constructor(timeoutPolicy?: ProviderTimeoutPolicy) {
    this.timeoutPolicy = timeoutPolicy ?? new ProviderTimeoutPolicy();
  }

  public async execute<TDTO = unknown>(
    context: ProviderExecutionStageContext<TDTO>,
    next: () => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>> {
    const timeoutMs = context.execContext?.timeoutMs ?? context.config?.timeoutMs ?? 5000;
    const isCancelled =
      context.execContext?.cancellationToken?.isCancelled ||
      context.execContext?.cancellationToken?.isCancellationRequested?.();

    if (isCancelled) {
      return new ConcreteProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: context.provider.info,
        latencyMs: 0,
        status: 'skipped',
        error: 'Execution cancelled by CancellationToken'
      });
    }

    try {
      return await this.timeoutPolicy.run<ProviderResult<TDTO>>(
        () => next(),
        timeoutMs,
        context.execContext?.cancellationToken
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCancelled =
        context.execContext?.cancellationToken?.isCancelled ||
        context.execContext?.cancellationToken?.isCancellationRequested?.() ||
        (err as { name?: string })?.name === 'AbortError' ||
        (err as { code?: string })?.code === 'ABORT_ERR' ||
        errorMsg.toLowerCase().includes('cancelled') ||
        errorMsg.toLowerCase().includes('aborted');

      const status = isCancelled ? 'skipped' : 'timeout';

      return new ConcreteProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: context.provider.info,
        latencyMs: status === 'skipped' ? 0 : timeoutMs,
        status,
        error: errorMsg
      });
    }
  }
}
