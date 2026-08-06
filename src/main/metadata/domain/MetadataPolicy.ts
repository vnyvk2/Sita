import type { MetadataProviderId } from '../models/RecordingMetadata';

export type PolicyLevel = 'global' | 'operation' | 'field' | 'user';

export interface FieldPolicyRule {
  fieldId: string;
  preferredProviderId: MetadataProviderId;
  fallbackProviderIds?: MetadataProviderId[];
}

export interface MetadataPolicyConfig {
  level: PolicyLevel;
  defaultProviderId: MetadataProviderId;
  providerPriorities: Record<string, number>; // e.g. { user: 1000, local: 100, musicbrainz: 500, discogs: 300 }
  fieldRules?: Record<string, FieldPolicyRule>;
}

export class MetadataPolicy {
  private readonly config: MetadataPolicyConfig;

  constructor(config: MetadataPolicyConfig) {
    this.config = config;
  }

  public get level(): PolicyLevel {
    return this.config.level;
  }

  public get defaultProvider(): MetadataProviderId {
    return this.config.defaultProviderId;
  }

  /**
   * Resolves the preferred provider for a specific field based on policy priorities and field overrides.
   */
  public resolveFieldProvider(fieldId: string): MetadataProviderId {
    const fieldRule = this.config.fieldRules?.[fieldId];
    if (fieldRule) {
      return fieldRule.preferredProviderId;
    }
    return this.config.defaultProviderId;
  }

  /**
   * Compares two providers by priority score. Higher score wins.
   */
  public compareProviderPriority(p1: MetadataProviderId, p2: MetadataProviderId): number {
    const score1 = this.config.providerPriorities[p1] ?? 0;
    const score2 = this.config.providerPriorities[p2] ?? 0;
    return score2 - score1;
  }

  public static createDefaultGlobalPolicy(): MetadataPolicy {
    return new MetadataPolicy({
      level: 'global',
      defaultProviderId: 'musicbrainz',
      providerPriorities: {
        user: 1000,
        local: 100,
        musicbrainz: 500,
        discogs: 300,
        spotify: 400
      }
    });
  }
}
