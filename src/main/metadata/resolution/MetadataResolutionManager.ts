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
   * Performs candidate resolution across registered providers via MetadataLookupGateway using MetadataContext.
   */
  public async resolveCandidates(
    operationId: string,
    context: MetadataContext
  ): Promise<MetadataResolution> {
    if (!this.lookupGateway) {
      throw new ResolutionUnavailableError(`No MetadataLookupGateway configured for operation ${operationId}`);
    }

    const candidates = await this.lookupGateway.searchCandidates(context);

    return {
      operationId,
      resourceId: context.targetResources[0]?.resourceId ?? 0,
      candidates,
      resolvedAt: Date.now()
    };
  }
}
