import type { MetadataLookupGateway } from './MetadataLookupGateway';
import type { MetadataResolution } from '../domain/MetadataResolution';
import type { MetadataContext } from '../domain/MetadataContext';
import { MetadataMergeEngine } from './MetadataMergeEngine';
import { ProviderRegistry } from './ProviderRegistry';

export class ResolutionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionUnavailableError';
  }
}

export class MetadataResolutionManager {
  private readonly lookupGateway?: MetadataLookupGateway;
  private readonly mergeEngine: MetadataMergeEngine;

  constructor(options?: MetadataLookupGateway | {
    lookupGateway?: MetadataLookupGateway;
    mergeEngine?: MetadataMergeEngine;
    providerRegistry?: ProviderRegistry;
  }) {
    if (options && 'searchCandidates' in options) {
      this.lookupGateway = options;
      const reg = new ProviderRegistry();
      this.mergeEngine = new MetadataMergeEngine(reg);
    } else {
      this.lookupGateway = options?.lookupGateway;
      const reg = options?.providerRegistry ?? new ProviderRegistry();
      this.mergeEngine = options?.mergeEngine ?? new MetadataMergeEngine(reg);
    }
  }

  /**
   * Performs resolution (lookup, candidate normalization, and multi-provider field merge evaluation) via MetadataLookupGateway and MetadataMergeEngine.
   */
  public async resolve(
    operationId: string,
    context: MetadataContext
  ): Promise<MetadataResolution> {
    if (!this.lookupGateway) {
      throw new ResolutionUnavailableError(`No MetadataLookupGateway configured for operation ${operationId}`);
    }

    const candidates = await this.lookupGateway.searchCandidates(context);
    const mergedResult = this.mergeEngine.mergeCandidates(candidates, context.policy);

    return {
      operationId,
      resourceId: context.resources.targetResources[0]?.id ?? 0,
      candidates,
      mergedResult,
      resolvedAt: Date.now()
    };
  }

  public get merger(): MetadataMergeEngine {
    return this.mergeEngine;
  }
}
