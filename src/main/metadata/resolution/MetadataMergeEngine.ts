import type { ProviderCandidate } from '../domain/MetadataResolution';
import type { MetadataPolicy } from '../domain/MetadataPolicy';
import type { ProviderAttribution } from '../domain/ProviderAttribution';
import type { ProviderRegistry } from './ProviderRegistry';

export interface FieldContribution {
  fieldId: string;
  providerId: string;
  value: string | number;
  confidenceScore: number;
}

export interface MergedCandidateResult {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
  artworkUrl?: string;
  fieldAttributions: Record<string, ProviderAttribution>;
  fieldAlternatives: Record<string, FieldContribution[]>;
}

export class MetadataMergeEngine {
  private readonly providerRegistry: ProviderRegistry;

  constructor(providerRegistry: ProviderRegistry) {
    this.providerRegistry = providerRegistry;
  }

  /**
   * Merges candidate objects by extracting field contributions and evaluating MergePolicy priorities.
   */
  public mergeCandidates(
    candidates: ProviderCandidate[],
    policy?: MetadataPolicy
  ): MergedCandidateResult {
    const rawContributions: FieldContribution[] = [];

    for (const cand of candidates) {
      const add = (fieldId: string, val?: string | number) => {
        if (val !== undefined && val !== null && String(val).trim().length > 0) {
          rawContributions.push({
            fieldId,
            providerId: cand.providerId,
            value: val,
            confidenceScore: cand.score
          });
        }
      };

      add('title', cand.title);
      add('artist', cand.artist);
      add('album', cand.matchedAttributes.album);
      add('genre', cand.matchedAttributes.genre);
      add('artworkUrl', cand.matchedAttributes.artworkUrl);
    }

    return this.mergeFieldContributions(rawContributions, policy);
  }

  /**
   * Directly merges independent field contributions across multiple providers according to MergePolicy priorities.
   */
  public mergeFieldContributions(
    contributions: FieldContribution[],
    policy?: MetadataPolicy
  ): MergedCandidateResult {
    const priorities: Record<string, number> = policy?.merge?.providerPriorities ?? {
      user: 1000,
      musicbrainz: 900,
      coverartarchive: 850,
      discogs: 800,
      spotify: 700,
      apple: 650
    };

    const contributionsByField: Record<string, FieldContribution[]> = {};

    for (const c of contributions) {
      if (!contributionsByField[c.fieldId]) {
        contributionsByField[c.fieldId] = [];
      }
      contributionsByField[c.fieldId].push(c);
    }

    const winningResult: Partial<MergedCandidateResult> = {};
    const fieldAttributions: Record<string, ProviderAttribution> = {};
    const fieldAlternatives: Record<string, FieldContribution[]> = {};

    for (const [fieldId, contribs] of Object.entries(contributionsByField)) {
      if (contribs.length === 0) continue;

      fieldAlternatives[fieldId] = [...contribs];

      const fieldPolicy = policy?.merge?.fieldPolicies?.[fieldId];
      let winning: FieldContribution | undefined;

      if (fieldPolicy?.preferredProviderId) {
        winning = contribs.find((c) => c.providerId.toLowerCase() === fieldPolicy.preferredProviderId?.toLowerCase());
      }

      if (!winning) {
        contribs.sort((a, b) => {
          const prioA = priorities[a.providerId.toLowerCase()] ?? 500;
          const prioB = priorities[b.providerId.toLowerCase()] ?? 500;
          if (prioA !== prioB) return prioB - prioA;
          return b.confidenceScore - a.confidenceScore;
        });
        winning = contribs[0];
      }

      if (winning) {
        (winningResult as Record<string, unknown>)[fieldId] = winning.value;
        const providerName = this.providerRegistry.getDisplayName(winning.providerId);
        fieldAttributions[fieldId] = {
          fieldId,
          providerId: winning.providerId,
          providerName,
          confidenceScore: winning.confidenceScore
        };
      }
    }

    return {
      title: winningResult.title ?? '',
      artist: winningResult.artist ?? '',
      album: winningResult.album,
      year: winningResult.year,
      genre: winningResult.genre,
      artworkUrl: winningResult.artworkUrl,
      fieldAttributions,
      fieldAlternatives
    };
  }

  /**
   * Recomputes a merged result when the user explicitly selects an alternate provider for a specific field.
   */
  public selectFieldProvider(
    merged: MergedCandidateResult,
    fieldId: string,
    providerId: string
  ): MergedCandidateResult {
    const alts = merged.fieldAlternatives[fieldId];
    if (!alts || alts.length === 0) return merged;

    const chosen = alts.find((a) => a.providerId.toLowerCase() === providerId.toLowerCase());
    if (!chosen) return merged;

    const updatedAttributions = { ...merged.fieldAttributions };
    updatedAttributions[fieldId] = {
      fieldId,
      providerId: chosen.providerId,
      providerName: this.providerRegistry.getDisplayName(chosen.providerId),
      confidenceScore: chosen.confidenceScore
    };

    return {
      ...merged,
      [fieldId]: chosen.value,
      fieldAttributions: updatedAttributions
    };
  }
}
