import type { MetadataEventBus } from '../../events/MetadataEventBus';
import type { IMetadataProvider } from '../../interfaces/IMetadataProvider';
import type { MetadataIdentity } from '../../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../../models/ProviderExecutionContext';
import type { ProviderResult } from '../../models/ProviderResult';
import type { ProviderExecutionPipeline } from '../execution/ProviderExecutionPipeline';
import type { IProviderExecutionStrategy } from './IProviderExecutionStrategy';

import { MetadataConfidence } from '../../models/MetadataConfidence';
import { ProviderBatchResult } from '../../models/ProviderBatchResult';
import { ProviderResult as ConcreteProviderResult } from '../../models/ProviderResult';
import { ProviderExecutionPipeline as ConcreteExecutionPipeline } from '../execution/ProviderExecutionPipeline';
import { ProviderExecutionStageContext } from '../execution/ProviderExecutionStageContext';

export class DefaultProviderExecutionStrategy implements IProviderExecutionStrategy {
  private readonly eventBus: MetadataEventBus;
  private readonly executionPipeline: ProviderExecutionPipeline;

  constructor(eventBus: MetadataEventBus, executionPipeline?: ProviderExecutionPipeline) {
    this.eventBus = eventBus;
    this.executionPipeline = executionPipeline ?? new ConcreteExecutionPipeline();
  }

  public async execute<TDTO = unknown>(
    providers: IMetadataProvider[],
    identity: MetadataIdentity,
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identity: MetadataIdentity,
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>[]> {
    const results: ProviderResult<TDTO>[] = [];

    for (const provider of providers) {
      const isCancelled =
        execContext?.cancellationToken?.isCancelled ||
        execContext?.cancellationToken?.isCancellationRequested?.();

      if (isCancelled) {
        const skippedResult = new ConcreteProviderResult<TDTO>({
          payload: null,
          confidence: MetadataConfidence.low(),
          providerInfo: provider.info,
          latencyMs: 0,
          status: 'skipped',
          error: 'Execution cancelled by CancellationToken'
        });

        this.eventBus.emit('ProviderSkipped', {
          providerInfo: provider.info,
          identity,
          status: 'skipped',
          latencyMs: 0,
          error: 'Execution cancelled by CancellationToken'
        });

        results.push(skippedResult);
        continue;
      }

      this.eventBus.emit('ProviderStarted', {
        providerInfo: provider.info,
        identity,
        latencyMs: 0
      });

      const stageContext = new ProviderExecutionStageContext<TDTO>({
        provider,
        identity,
        execContext,
        eventBus: this.eventBus,
        action: action as (
          provider: IMetadataProvider,
          identity: MetadataIdentity,
          context?: ProviderExecutionContext
        ) => Promise<unknown>
      });

      const res = await this.executionPipeline.process<TDTO>(stageContext);

      if (res.status === 'timeout') {
        this.eventBus.emit('ProviderTimeout', {
          providerInfo: provider.info,
          identity,
          status: 'timeout',
          latencyMs: res.latencyMs,
          error: res.error
        });
      } else if (res.status === 'failed') {
        this.eventBus.emit('ProviderFailed', {
          providerInfo: provider.info,
          identity,
          status: 'failed',
          latencyMs: res.latencyMs,
          error: res.error
        });
      } else if (res.status === 'skipped') {
        this.eventBus.emit('ProviderSkipped', {
          providerInfo: provider.info,
          identity,
          status: 'skipped',
          latencyMs: res.latencyMs,
          error: res.error
        });
      } else {
        this.eventBus.emit('ProviderCompleted', {
          providerInfo: provider.info,
          identity,
          status: 'success',
          latencyMs: res.latencyMs
        });
      }

      results.push(res);
    }

    return results;
  }

  public async executeMany<TDTO = unknown>(
    providers: IMetadataProvider[],
    identities: MetadataIdentity[],
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identities: MetadataIdentity[],
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>[]>
  ): Promise<ProviderBatchResult<TDTO>[]> {
    if (identities.length === 0) return [];
    const batchResults: ProviderBatchResult<TDTO>[] = [];

    for (const provider of providers) {
      const isCancelled =
        execContext?.cancellationToken?.isCancelled ||
        execContext?.cancellationToken?.isCancellationRequested?.();

      if (isCancelled) {
        const resultsByIdentity = new Map<string, ProviderResult<TDTO>>();
        identities.forEach((identity) => {
          resultsByIdentity.set(
            identity.metadataId,
            new ConcreteProviderResult<TDTO>({
              payload: null,
              confidence: MetadataConfidence.low(),
              providerInfo: provider.info,
              latencyMs: 0,
              status: 'skipped',
              error: 'Execution cancelled by CancellationToken'
            })
          );
        });
        batchResults.push(
          new ProviderBatchResult<TDTO>({
            providerInfo: provider.info,
            resultsByIdentity
          })
        );
        continue;
      }

      const rawResults = await action(provider, identities, execContext);
      const resultsByIdentity = new Map<string, ProviderResult<TDTO>>();
      identities.forEach((identity, index) => {
        const res = rawResults[index];
        if (res) {
          resultsByIdentity.set(identity.metadataId, res);
        }
      });

      batchResults.push(
        new ProviderBatchResult<TDTO>({
          providerInfo: provider.info,
          resultsByIdentity
        })
      );
    }

    return batchResults;
  }
}
