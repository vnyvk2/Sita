import type { MetadataLookupGateway } from './MetadataLookupGateway';
import type { MetadataResolution } from '../domain/MetadataResolution';
import type { MetadataContext } from '../domain/MetadataContext';

export class ResolutionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionUnavailableError';
  }
}

export class MetadataResolutionManager {
  private readonly lookupGateway?: MetadataLookupGateway;

  constructor(lookupGateway?: MetadataLookupGateway) {
    this.lookupGateway = lookupGateway;
  }

  /**
   * Performs resolution (lookup, candidate normalization, and merge evaluation) via MetadataLookupGateway.
   */
  public async resolve(
    operationId: string,
    context: MetadataContext
  ): Promise<MetadataResolution> {
    if (!this.lookupGateway) {
      throw new ResolutionUnavailableError(`No MetadataLookupGateway configured for operation ${operationId}`);
    }

    const candidates = await this.lookupGateway.searchCandidates(context);

    return {
      operationId,
      resourceId: context.resources.targetResources[0]?.id ?? 0,
      candidates,
      resolvedAt: Date.now()
    };
  }
}
