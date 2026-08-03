import type { MetadataCapability } from '../common/types';
import type { MetadataEventBus } from '../events/MetadataEventBus';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { IMetadataProviderExecutor } from '../interfaces/IMetadataProviderExecutor';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';
import type { MetadataProviderRegistry } from '../registries/MetadataProviderRegistry';
import type { IProviderExecutionStrategy } from './strategies/IProviderExecutionStrategy';
import type { IProviderSelectionStrategy } from './strategies/IProviderSelectionStrategy';

import { DefaultProviderExecutionStrategy } from './strategies/DefaultProviderExecutionStrategy';
import { DefaultProviderSelectionStrategy } from './strategies/DefaultProviderSelectionStrategy';

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
    this.selectionStrategy =
      options.selectionStrategy ?? new DefaultProviderSelectionStrategy();
    this.executionStrategy =
      options.executionStrategy ?? new DefaultProviderExecutionStrategy(options.eventBus);
  }

  public async execute<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

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
  ): Promise<ProviderResult<TDTO>[]> {
    if (identities.length === 0) return [];
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

    return this.executionStrategy.executeMany<TDTO>(
      targetProviders,
      identities,
      execContext,
      (provider, ids, ctx) => provider.fetchMany<TDTO>(ids, ctx)
    );
  }

  public async refresh<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<ProviderResult<TDTO>[]> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

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
  ): Promise<ProviderResult<TDTO>[]> {
    if (identities.length === 0) return [];
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

    return this.executionStrategy.executeMany<TDTO>(
      targetProviders,
      identities,
      execContext,
      (provider, ids, ctx) => provider.refreshMany<TDTO>(ids, ctx)
    );
  }
}
