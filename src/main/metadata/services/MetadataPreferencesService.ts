import type { MetadataProviderId } from '../../../common/metadata/provider';
import {
  DEFAULT_METADATA_PREFERENCES,
  type MetadataProviderPreferences
} from '../../../common/metadata/preferences';
import { getUserSettings, saveUserSettings } from '../../db/queries/settings';

export class MetadataPreferencesService {
  private cachedPreferences: MetadataProviderPreferences | null = null;

  public async getPreferences(): Promise<MetadataProviderPreferences> {
    if (this.cachedPreferences) {
      return this.cachedPreferences;
    }

    try {
      const settings = await getUserSettings();
      if (settings?.metadataPreferences) {
        this.cachedPreferences = this.sanitizePreferences(settings.metadataPreferences);
        return this.cachedPreferences;
      }
    } catch {
      // Fallback to default if settings table is not yet seeded or query fails
    }

    return { ...DEFAULT_METADATA_PREFERENCES };
  }

  public async savePreferences(
    updates: Partial<MetadataProviderPreferences>,
    availableSearchProviders?: string[]
  ): Promise<MetadataProviderPreferences> {
    const current = await this.getPreferences();
    const merged: MetadataProviderPreferences = {
      ...current,
      ...updates
    };

    // Validation Guardrails
    this.validatePreferences(merged, availableSearchProviders);

    const sanitized = this.sanitizePreferences(merged);

    try {
      await saveUserSettings({ metadataPreferences: sanitized } as any);
      this.cachedPreferences = sanitized;
      return sanitized;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to persist metadata preferences: ${msg}`);
    }
  }

  public validatePreferences(
    prefs: MetadataProviderPreferences,
    availableSearchProviders?: string[]
  ): void {
    if (!Array.isArray(prefs.enabledSearchProviders) || prefs.enabledSearchProviders.length === 0) {
      throw new Error('Enabled search providers must contain at least one valid provider.');
    }

    if (!Array.isArray(prefs.searchProviderPriority) || prefs.searchProviderPriority.length === 0) {
      throw new Error('Search provider priority must contain at least one valid provider.');
    }

    // Check uniqueness
    const uniquePriority = new Set(prefs.searchProviderPriority);
    if (uniquePriority.size !== prefs.searchProviderPriority.length) {
      throw new Error('Search provider priority must contain unique provider entries without duplicates.');
    }

    // Priority must be a subset of enabled providers
    const enabledSet = new Set(prefs.enabledSearchProviders);
    for (const p of prefs.searchProviderPriority) {
      if (!enabledSet.has(p)) {
        throw new Error(`Priority provider '${p}' must be one of the enabled search providers.`);
      }
    }

    // If available registered providers list is supplied, verify containment
    if (availableSearchProviders && availableSearchProviders.length > 0) {
      const registeredSet = new Set(availableSearchProviders.map((s) => s.toLowerCase()));
      for (const p of prefs.enabledSearchProviders) {
        if (!registeredSet.has(p.toLowerCase())) {
          throw new Error(`Search provider '${p}' is not registered with search capability.`);
        }
      }
    }
  }

  private sanitizePreferences(raw: Partial<MetadataProviderPreferences>): MetadataProviderPreferences {
    return {
      enabledSearchProviders:
        Array.isArray(raw.enabledSearchProviders) && raw.enabledSearchProviders.length > 0
          ? (Array.from(new Set(raw.enabledSearchProviders)) as MetadataProviderId[])
          : [...DEFAULT_METADATA_PREFERENCES.enabledSearchProviders],
      searchProviderPriority:
        Array.isArray(raw.searchProviderPriority) && raw.searchProviderPriority.length > 0
          ? (Array.from(new Set(raw.searchProviderPriority)) as MetadataProviderId[])
          : [...DEFAULT_METADATA_PREFERENCES.searchProviderPriority],
      defaultArtworkProvider: raw.defaultArtworkProvider ?? DEFAULT_METADATA_PREFERENCES.defaultArtworkProvider,
      defaultGenreProvider: raw.defaultGenreProvider ?? DEFAULT_METADATA_PREFERENCES.defaultGenreProvider,
      defaultLyricsProvider: raw.defaultLyricsProvider ?? DEFAULT_METADATA_PREFERENCES.defaultLyricsProvider
    };
  }

  public clearCache(): void {
    this.cachedPreferences = null;
  }
}
