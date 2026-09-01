import type { MetadataCapability } from '../common/types';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataProviderExecutor } from '../interfaces/IMetadataProviderExecutor';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import { ProviderBatchResult } from '../models/ProviderBatchResult';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';
import type { MetadataProviderRegistry } from '../registries/MetadataProviderRegistry';
import { DefaultProviderExecutionStrategy } from './strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from './strategies/DefaultProviderSelectionStrategy';
import type { IProviderExecutionStrategy } from './strategies/IProviderExecutionStrategy';
import type { IProviderSelectionStrategy } from './strategies/IProviderSelectionStrategy';

export interface MetadataProviderExecutorOptions {
  registry: MetadataProviderRegistry;
  eventBus: MetadataEventBus;
  selectionStrategy?: IProviderSelectionStrategy;
  executionStrategy?: IProviderExecutionStrategy;
}

export class MetadataProviderExecutor implements IMetadataProviderExecutor {
  private readonly registry: MetadataProviderRegistry;
  private readonly selectionStrategy: IProviderSelectionStrategy;
  private readonly executionStrategy: IProviderExecutionStrategy;

  constructor(options: MetadataProviderExecutorOptions) {
    this.registry = options.registry;
    this.selectionStrategy = options.selectionStrategy ?? new DefaultProviderSelectionStrategy();
    this.executionStrategy =
      options.executionStrategy ?? new DefaultProviderExecutionStrategy(options.eventBus);
  }

  public async execute<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(allProviders, capability);

    return this.executionStrategy.execute<TDTO>(
      targetProviders,
      identity,
      execContext,
      (provider, id, ctx) => provider.fetch<TDTO>(id, ctx)
    );
  }

  public async executeMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderBatchResult<TDTO>[]> {
    if (identities.length === 0) return [];
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(allProviders, capability);

    // Group identities by entityKind inside executor
    const groupedMisses = new Map<string, MetadataIdentity[]>();
    for (const identity of identities) {
      const list = groupedMisses.get(identity.entityKind) ?? [];
      list.push(identity);
      groupedMisses.set(identity.entityKind, list);
    }

    const aggregatedBatchResults: ProviderBatchResult<TDTO>[] = [];

    for (const [_, kindIdentities] of groupedMisses.entries()) {
      const batchResults = await this.executionStrategy.executeMany<TDTO>(
        targetProviders,
        kindIdentities,
        execContext,
        (provider, ids, ctx) => provider.fetchMany<TDTO>(ids, ctx)
      );
      aggregatedBatchResults.push(...batchResults);
    }

    return aggregatedBatchResults;
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(allProviders, capability);

    return this.executionStrategy.execute<TDTO>(
      targetProviders,
      identity,
      execContext,
      (provider, id, ctx) => provider.refresh<TDTO>(id, ctx)
    );
  }

  public async refreshMany<TDTO = unknown>(
    identities: MetadataIdentity[],
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderBatchResult<TDTO>[]> {
    if (identities.length === 0) return [];
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(allProviders, capability);

    const groupedMisses = new Map<string, MetadataIdentity[]>();
    for (const identity of identities) {
      const list = groupedMisses.get(identity.entityKind) ?? [];
      list.push(identity);
      groupedMisses.set(identity.entityKind, list);
    }

    const aggregatedBatchResults: ProviderBatchResult<TDTO>[] = [];

    for (const [_, kindIdentities] of groupedMisses.entries()) {
      const batchResults = await this.executionStrategy.executeMany<TDTO>(
        targetProviders,
        kindIdentities,
        execContext,
        (provider, ids, ctx) => provider.refreshMany<TDTO>(ids, ctx)
      );
      aggregatedBatchResults.push(...batchResults);
    }

    return aggregatedBatchResults;
  }
}
