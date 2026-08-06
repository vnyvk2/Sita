import type { MergedCandidateResult, FieldContribution } from './MetadataMergeEngine';
import type { MetadataMergeEngine } from './MetadataMergeEngine';
import type { ProviderAttribution } from '../domain/ProviderAttribution';
import type { MetadataPolicy } from '../domain/MetadataPolicy';

export class MergeSession {
  private readonly mergeEngine: MetadataMergeEngine;
  private readonly rawContributions: FieldContribution[];
  private readonly currentPolicy: MetadataPolicy;
  private readonly currentResult: MergedCandidateResult;

  constructor(
    mergeEngine: MetadataMergeEngine,
    contributions: FieldContribution[],
    policy?: MetadataPolicy,
    initialResult?: MergedCandidateResult
  ) {
    this.mergeEngine = mergeEngine;
    this.rawContributions = [...contributions];
    this.currentPolicy = policy ?? {
      merge: {
        providerPriorities: {
          user: 1000,
          musicbrainz: 900,
          coverartarchive: 850,
          discogs: 800,
          spotify: 700,
          apple: 650
        },
        fieldPolicies: {}
      }
    };
    this.currentResult = initialResult ?? this.mergeEngine.mergeFieldContributions(this.rawContributions, this.currentPolicy);
  }

  /**
   * Recomputes the entire session preview through policy updating and deterministic re-merge evaluation.
   * Returns a new immutable MergeSession instance.
   */
  public selectProvider(fieldId: string, providerId: string): MergeSession {
    const updatedFieldPolicies = {
      ...(this.currentPolicy.merge?.fieldPolicies ?? {}),
      [fieldId]: { preferredProviderId: providerId }
    };

    const updatedPolicy: MetadataPolicy = {
      ...this.currentPolicy,
      merge: {
        ...this.currentPolicy.merge,
        providerPriorities: this.currentPolicy.merge?.providerPriorities ?? {},
        fieldPolicies: updatedFieldPolicies
      }
    };

    const newResult = this.mergeEngine.mergeFieldContributions(this.rawContributions, updatedPolicy);
    return new MergeSession(this.mergeEngine, this.rawContributions, updatedPolicy, newResult);
  }

  public get result(): MergedCandidateResult {
    return this.currentResult;
  }

  public get policy(): MetadataPolicy {
    return this.currentPolicy;
  }

  public getAttribution(fieldId: string): ProviderAttribution | undefined {
    return this.currentResult.fieldAttributions[fieldId];
  }

  public getAlternatives(fieldId: string): FieldContribution[] {
    return this.currentResult.fieldAlternatives[fieldId] ?? [];
  }

  public get contributions(): FieldContribution[] {
    return [...this.rawContributions];
  }
}
