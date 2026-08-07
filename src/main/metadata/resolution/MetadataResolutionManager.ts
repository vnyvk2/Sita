import type { MetadataLookupGateway, DefaultMetadataLookupGateway } from './MetadataLookupGateway';
import type { MetadataResolution, ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataContext } from '../domain/MetadataContext';
import type { MetadataPolicy } from '../domain/MetadataPolicy';
import { MetadataMergeEngine, type FieldContribution, type MergedCandidateResult } from './MetadataMergeEngine';
import { MergeSession } from './MergeSession';
import { ProviderRegistry } from './ProviderRegistry';

export interface ResolutionRequest {
  operationId: string;
  targetResourceIds: (string | number)[];
  albumTitle: string;
  artistName?: string;
  mbid?: string;
  releaseId?: string;
  policy?: MetadataPolicy;
}

export class ResolutionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionUnavailableError';
  }
}

export class MetadataResolutionManager {
  private readonly lookupGateway?: MetadataLookupGateway;
  private readonly mergeEngine: MetadataMergeEngine;
  private readonly providerRegistry: ProviderRegistry;

  constructor(options?: MetadataLookupGateway | {
    lookupGateway?: MetadataLookupGateway;
    mergeEngine?: MetadataMergeEngine;
    providerRegistry?: ProviderRegistry;
  }) {
    if (options && 'searchCandidates' in options) {
      this.lookupGateway = options;
      this.providerRegistry = (options as DefaultMetadataLookupGateway).registry ?? new ProviderRegistry();
      this.mergeEngine = new MetadataMergeEngine(this.providerRegistry);
    } else {
      this.lookupGateway = options?.lookupGateway;
      const gwRegistry = (options?.lookupGateway as DefaultMetadataLookupGateway)?.registry;
      this.providerRegistry = options?.providerRegistry ?? gwRegistry ?? new ProviderRegistry();
      this.mergeEngine = options?.mergeEngine ?? new MetadataMergeEngine(this.providerRegistry);
    }
  }

  /**
   * Performs multi-provider resolution (lookup, candidate normalization, contribution harvesting, and field merge evaluation)
   * driven by clean ResolutionRequest DTO. Constructing internal MetadataContext transparently.
   */
  public async resolve(
    request: ResolutionRequest | string,
    legacyContext?: MetadataContext
  ): Promise<MetadataResolution> {
    if (!this.lookupGateway) {
      const opId = typeof request === 'string' ? request : request.operationId;
      throw new ResolutionUnavailableError(`No MetadataLookupGateway configured for operation ${opId}`);
    }

    // Support legacy signature (operationId: string, context: MetadataContext)
    if (typeof request === 'string') {
      const context = legacyContext!;
      const candidates = await this.lookupGateway.searchCandidates(context);
      const mergedResult = this.mergeEngine.mergeCandidates(candidates, context.policy);
      return {
        operationId: request,
        resourceId: context.resources.targetResources[0]?.id ?? 0,
        candidates,
        mergedResult,
        resolvedAt: Date.now()
      };
    }

    // Phase 13D Adopt Resolution Pipeline: Request DTO pattern
    const targetMbid = request.mbid ?? request.releaseId;
    const context: MetadataContext = {
      resources: {
        primaryType: 'album',
        targetResources: request.targetResourceIds.map((id) => ({ id, type: 'album', attributes: {} }))
      },
      execution: { mode: 'Interactive' },
      request: {
        id: request.operationId,
        query: {
          albumTitle: request.albumTitle,
          artistName: request.artistName,
          mbid: targetMbid,
          releaseId: targetMbid
        } as any,
        policy: request.policy,
        requestedAt: Date.now()
      },
      policy: request.policy
    };

    let fieldContributions: FieldContribution[] = [];
    let candidates: ProviderCandidate[] = [];

    if (this.lookupGateway.searchContributions) {
      fieldContributions = await this.lookupGateway.searchContributions(context);
    }

    candidates = await this.lookupGateway.searchCandidates(context);

    const mergedResult: MergedCandidateResult = fieldContributions.length > 0
      ? this.mergeEngine.mergeFieldContributions(fieldContributions, request.policy)
      : this.mergeEngine.mergeCandidates(candidates, request.policy);

    const session = new MergeSession(this.mergeEngine, fieldContributions, request.policy, mergedResult);

    return {
      operationId: request.operationId,
      resourceId: request.targetResourceIds[0] ?? 0,
      candidates,
      mergedResult,
      resolvedAt: Date.now(),
      session
    };
  }

  public get merger(): MetadataMergeEngine {
    return this.mergeEngine;
  }

  public get registry(): ProviderRegistry {
    return this.providerRegistry;
  }
}
