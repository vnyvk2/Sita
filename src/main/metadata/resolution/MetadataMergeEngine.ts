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
}

export class MetadataMergeEngine {
  private readonly providerRegistry: ProviderRegistry;

  constructor(providerRegistry: ProviderRegistry) {
    this.providerRegistry = providerRegistry;
  }

  /**
   * Merges field-level contributions across multiple provider candidates according to declarative MergePolicy priorities.
   */
  public mergeCandidates(
    candidates: ProviderCandidate[],
    policy?: MetadataPolicy
  ): MergedCandidateResult {
    const defaultResult: MergedCandidateResult = {
      title: candidates[0]?.title ?? '',
      artist: candidates[0]?.artist ?? '',
      fieldAttributions: {}
    };

    if (!candidates || candidates.length === 0) {
      return defaultResult;
    }

    const priorities: Record<string, number> = policy?.merge?.providerPriorities ?? {
      user: 1000,
      musicbrainz: 900,
      coverartarchive: 850,
      discogs: 800,
      spotify: 700,
      apple: 650
    };

    const contributionsByField: Record<string, FieldContribution[]> = {};

    for (const cand of candidates) {
      const pid = cand.providerId.toLowerCase();
      const score = cand.score;

      const addContrib = (fieldId: string, val?: string | number) => {
        if (val !== undefined && val !== null && String(val).trim().length > 0) {
          if (!contributionsByField[fieldId]) contributionsByField[fieldId] = [];
          contributionsByField[fieldId].push({
            fieldId,
            providerId: cand.providerId,
            value: val,
            confidenceScore: score
          });
        }
      };

      addContrib('title', cand.title);
      addContrib('artist', cand.artist);
      addContrib('album', cand.matchedAttributes.album);
      addContrib('genre', cand.matchedAttributes.genre);
      addContrib('artworkUrl', cand.matchedAttributes.artworkUrl);
    }

    const winningResult: Partial<MergedCandidateResult> = {};
    const fieldAttributions: Record<string, ProviderAttribution> = {};

    for (const [fieldId, contribs] of Object.entries(contributionsByField)) {
      if (contribs.length === 0) continue;

      // Check field-specific policy overrides
      const fieldPolicy = policy?.merge?.fieldPolicies?.[fieldId];
      let winning: FieldContribution | undefined;

      if (fieldPolicy?.preferredProviderId) {
        winning = contribs.find((c) => c.providerId.toLowerCase() === fieldPolicy.preferredProviderId?.toLowerCase());
      }

      if (!winning) {
        // Sort contributions by provider priority high-to-low then confidence score
        contribs.sort((a, b) => {
          const prioA = priorities[a.providerId.toLowerCase()] ?? 500;
          const priob = priorities[b.providerId.toLowerCase()] ?? 500;
          if (prioA !== priob) return priob - prioA;
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
      title: winningResult.title ?? candidates[0]?.title ?? '',
      artist: winningResult.artist ?? candidates[0]?.artist ?? '',
      album: winningResult.album,
      year: winningResult.year,
      genre: winningResult.genre,
      artworkUrl: winningResult.artworkUrl,
      fieldAttributions
    };
  }
}
