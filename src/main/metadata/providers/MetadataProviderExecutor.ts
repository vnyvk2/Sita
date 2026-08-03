import type { MetadataCapability } from '../common/types';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { IMetadataProviderExecutor } from '../interfaces/IMetadataProviderExecutor';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { MetadataProviderRegistry } from '../registries/MetadataProviderRegistry';
import type { IProviderSelectionStrategy } from './strategies/IProviderSelectionStrategy';

import { MetadataConfidence } from '../models/MetadataConfidence';
import { ProviderResult } from '../models/ProviderResult';
import { DefaultProviderSelectionStrategy } from './strategies/DefaultProviderSelectionStrategy';

export interface MetadataProviderExecutorOptions {
  registry: MetadataProviderRegistry;
  eventBus: MetadataEventBus;
  selectionStrategy?: IProviderSelectionStrategy;
}

export class MetadataProviderExecutor implements IMetadataProviderExecutor {
  private readonly registry: MetadataProviderRegistry;
  private readonly eventBus: MetadataEventBus;
  private readonly selectionStrategy: IProviderSelectionStrategy;

  constructor(options: MetadataProviderExecutorOptions) {
    this.registry = options.registry;
    this.eventBus = options.eventBus;
    this.selectionStrategy =
      options.selectionStrategy ?? new DefaultProviderSelectionStrategy();
  }

  public async execute<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    return this.runOnProviders<TDTO>(identity, capability, execContext, (p, id, ctx) =>
      p.fetch<TDTO>(id, ctx)
    );
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    return this.runOnProviders<TDTO>(identity, capability, execContext, (p, id, ctx) =>
      p.refresh<TDTO>(id, ctx)
    );
  }

  private async runOnProviders<TDTO>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identity: MetadataIdentity,
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>[]> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

    const results: ProviderResult<TDTO>[] = [];

    for (const provider of targetProviders) {
      const isCancelled =
        execContext?.cancellationToken?.isCancelled ||
        execContext?.cancellationToken?.isCancellationRequested?.();

      if (isCancelled) {
        this.eventBus.emit('ProviderSkipped', {
          providerInfo: provider.info,
          identity,
          status: 'skipped',
          latencyMs: 0,
          error: 'Execution cancelled by CancellationToken'
        });
        continue;
      }

      const result = await this.executeSingleProvider<TDTO>(
        provider,
        identity,
        execContext,
        action
      );
      results.push(result);
    }

    return results;
  }

  private async executeSingleProvider<TDTO>(
    provider: IMetadataProvider,
    identity: MetadataIdentity,
    execContext: ProviderExecutionContext | undefined,
    action: (
      provider: IMetadataProvider,
      identity: MetadataIdentity,
      context?: ProviderExecutionContext
    ) => Promise<ProviderResult<TDTO>>
  ): Promise<ProviderResult<TDTO>> {
    const timeoutMs = execContext?.timeoutMs ?? 5000;
    const startTime = Date.now();

    this.eventBus.emit('ProviderStarted', {
      providerInfo: provider.info,
      identity,
      latencyMs: 0
    });

    try {
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise<ProviderResult<TDTO>>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve(
            new ProviderResult<TDTO>({
              payload: null,
              confidence: MetadataConfidence.low(),
              providerInfo: provider.info,
              latencyMs: timeoutMs,
              status: 'timeout',
              error: `Provider execution timed out after ${timeoutMs}ms`
            })
          );
        }, timeoutMs);
      });

      const providerPromise = action(provider, identity, execContext);
      const res = await Promise.race([providerPromise, timeoutPromise]);
      clearTimeout(timeoutHandle!);

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
      } else {
        this.eventBus.emit('ProviderCompleted', {
          providerInfo: provider.info,
          identity,
          status: 'success',
          latencyMs: res.latencyMs
        });
      }

      return res;
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      const errorResult = new ProviderResult<TDTO>({
        payload: null,
        confidence: MetadataConfidence.low(),
        providerInfo: provider.info,
        latencyMs,
        status: 'failed',
        error: errorMsg
      });

      this.eventBus.emit('ProviderFailed', {
        providerInfo: provider.info,
        identity,
        status: 'failed',
        latencyMs,
        error: errorMsg
      });

      return errorResult;
    }
  }
}
