import type { MergedCandidateResult, FieldContribution } from './MetadataMergeEngine';
import type { MetadataMergeEngine } from './MetadataMergeEngine';
import type { ProviderAttribution } from '../domain/ProviderAttribution';
import type { MetadataPolicy } from '../domain/MetadataPolicy';

export class MergeSession {
  private readonly mergeEngine: MetadataMergeEngine;
  private readonly rawContributions: FieldContribution[];
  private readonly currentPolicy?: MetadataPolicy;
  private readonly currentResult: MergedCandidateResult;

  constructor(
    mergeEngine: MetadataMergeEngine,
    contributions: FieldContribution[],
    policy?: MetadataPolicy,
    initialResult?: MergedCandidateResult
  ) {
    this.mergeEngine = mergeEngine;
    this.rawContributions = [...contributions];
    this.currentPolicy = policy;
    this.currentResult = initialResult ?? this.mergeEngine.mergeFieldContributions(this.rawContributions, this.currentPolicy);
  }

  /**
   * Recomputes the session preview when a user explicitly selects an alternate provider for a field.
   * Returns a new immutable MergeSession instance.
   */
  public selectProvider(fieldId: string, providerId: string): MergeSession {
    const updatedResult = this.mergeEngine.selectFieldProvider(this.currentResult, fieldId, providerId);
    return new MergeSession(this.mergeEngine, this.rawContributions, this.currentPolicy, updatedResult);
  }

  public get result(): MergedCandidateResult {
    return this.currentResult;
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
