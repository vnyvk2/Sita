import type { MetadataCapability } from '../common/types';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { ProviderExecutionContext } from '../models/ProviderExecutionContext';
import type { ProviderResult } from '../models/ProviderResult';
import type { IMetadataProvider } from '../interfaces/IMetadataProvider';
import type { IMetadataMergePolicy } from '../providers/policies/IMetadataMergePolicy';
import type { IProviderSelectionStrategy } from '../providers/strategies/IProviderSelectionStrategy';
import type { IProviderExecutionStrategy } from '../providers/strategies/IProviderExecutionStrategy';
import type { MetadataProviderRegistry } from '../registries/MetadataProviderRegistry';

export interface MetadataMergeEngineOptions {
  registry: MetadataProviderRegistry;
  mergePolicy: IMetadataMergePolicy;
  selectionStrategy: IProviderSelectionStrategy;
  executionStrategy: IProviderExecutionStrategy;
}

export class MetadataMergeEngine {
  private readonly registry: MetadataProviderRegistry;
  private readonly mergePolicy: IMetadataMergePolicy;
  private readonly selectionStrategy: IProviderSelectionStrategy;
  private readonly executionStrategy: IProviderExecutionStrategy;

  constructor(options: MetadataMergeEngineOptions) {
    this.registry = options.registry;
    this.mergePolicy = options.mergePolicy;
    this.selectionStrategy = options.selectionStrategy;
    this.executionStrategy = options.executionStrategy;
  }

  public async mergeEntity<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<TDTO | null> {
    return this.executeMerge<TDTO>(identity, capability, execContext, (provider, id, ctx) =>
      provider.fetch<TDTO>(id, ctx)
    );
  }

  public async refreshAndMergeEntity<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext?: ProviderExecutionContext
  ): Promise<TDTO | null> {
    return this.executeMerge<TDTO>(identity, capability, execContext, (provider, id, ctx) =>
      provider.refresh<TDTO>(id, ctx)
    );
  }

  private async executeMerge<TDTO = unknown>(
    identity: MetadataIdentity,
    capability: MetadataCapability,
    execContext: ProviderExecutionContext | undefined,
    operation: (provider: IMetadataProvider, id: MetadataIdentity, ctx?: ProviderExecutionContext) => Promise<ProviderResult<TDTO>>
  ): Promise<TDTO | null> {
    const allProviders = this.registry.getAll();
    const targetProviders = this.selectionStrategy.selectProviders(
      allProviders,
      capability
    );

    const providerResults = await this.executionStrategy.execute<TDTO>(
      targetProviders,
      identity,
      execContext,
      operation
    );

    return this.mergePolicy.merge<TDTO>(providerResults);
  }
}
