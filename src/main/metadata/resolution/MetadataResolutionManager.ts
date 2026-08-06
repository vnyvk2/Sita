import type { MetadataLookupGateway, LookupQueryOptions } from './MetadataLookupGateway';
import type { MetadataResolution } from '../domain/MetadataResolution';

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
   * Performs candidate resolution across registered providers via MetadataLookupGateway.
   */
  public async resolveCandidates(
    operationId: string,
    resourceId: string | number,
    options: LookupQueryOptions
  ): Promise<MetadataResolution> {
    if (!this.lookupGateway) {
      throw new ResolutionUnavailableError(`No MetadataLookupGateway configured for operation ${operationId}`);
    }

    const candidates = await this.lookupGateway.searchCandidates(options);

    return {
      operationId,
      resourceId,
      candidates,
      resolvedAt: Date.now()
    };
  }
}
