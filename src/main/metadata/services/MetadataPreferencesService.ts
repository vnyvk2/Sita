import type { MetadataProviderId } from '../../../common/metadata/provider';
import {
  DEFAULT_METADATA_PREFERENCES,
  type MetadataProviderPreferences
} from '../../../common/metadata/preferences';
import { getUserSettings, saveUserSettings } from '../../db/queries/settings';

export interface MetadataPreferencesServiceOptions {
  getRegisteredSearchProviders?: () => MetadataProviderId[];
}

export class MetadataPreferencesService {
  private cachedPreferences: MetadataProviderPreferences | null = null;
  private readonly getRegisteredSearchProviders?: () => MetadataProviderId[];

  constructor(options?: MetadataPreferencesServiceOptions) {
    this.getRegisteredSearchProviders = options?.getRegisteredSearchProviders;
  }

  public async getPreferences(): Promise<MetadataProviderPreferences> {
    if (this.cachedPreferences) {
      return this.cachedPreferences;
    }

    const registered = this.getRegisteredSearchProviders ? this.getRegisteredSearchProviders() : undefined;

    try {
      const settings = await getUserSettings();
      if (settings?.metadataPreferences) {
        this.cachedPreferences = this.sanitizeAndValidate(settings.metadataPreferences, registered);
        return this.cachedPreferences;
      }
    } catch {
      // Fallback to default if settings table is not yet seeded or query fails
    }

    this.cachedPreferences = this.sanitizeAndValidate(DEFAULT_METADATA_PREFERENCES, registered);
    return this.cachedPreferences;
  }

  public async savePreferences(
    updates: Partial<MetadataProviderPreferences>,
    availableSearchProviders?: string[]
  ): Promise<MetadataProviderPreferences> {
    const registered =
      availableSearchProviders ??
      (this.getRegisteredSearchProviders ? this.getRegisteredSearchProviders() : undefined);

    const current = await this.getPreferences();
    const merged: MetadataProviderPreferences = {
      ...current,
      ...updates
    };

    // Strict validation on save: throws if user passes an invalid configuration
    this.validatePreferences(merged, registered);

    const sanitized = this.sanitizeAndValidate(merged, registered);

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

  public sanitizeAndValidate(
    raw: Partial<MetadataProviderPreferences>,
    availableSearchProviders?: string[]
  ): MetadataProviderPreferences {
    let enabled = Array.isArray(raw.enabledSearchProviders) && raw.enabledSearchProviders.length > 0
      ? (Array.from(new Set(raw.enabledSearchProviders)) as MetadataProviderId[])
      : [...DEFAULT_METADATA_PREFERENCES.enabledSearchProviders];

    // Filter against registered providers if provided
    if (availableSearchProviders && availableSearchProviders.length > 0) {
      const registeredSet = new Set(availableSearchProviders.map((s) => s.toLowerCase()));
      enabled = enabled.filter((p) => registeredSet.has(p.toLowerCase()));
      if (enabled.length === 0) {
        // Fallback to first registered provider or musicbrainz
        const fallback = (availableSearchProviders[0] as MetadataProviderId) ?? 'musicbrainz';
        enabled = [fallback];
      }
    }

    const enabledSet = new Set(enabled);
    let priority = Array.isArray(raw.searchProviderPriority) && raw.searchProviderPriority.length > 0
      ? (Array.from(new Set(raw.searchProviderPriority)) as MetadataProviderId[])
      : [...enabled];

    // Filter priority to be a subset of enabled
    priority = priority.filter((p) => enabledSet.has(p));
    if (priority.length === 0) {
      priority = [...enabled];
    }

    return {
      enabledSearchProviders: enabled,
      searchProviderPriority: priority,
      defaultArtworkProvider: raw.defaultArtworkProvider ?? DEFAULT_METADATA_PREFERENCES.defaultArtworkProvider,
      defaultGenreProvider: raw.defaultGenreProvider ?? DEFAULT_METADATA_PREFERENCES.defaultGenreProvider,
      defaultLyricsProvider: raw.defaultLyricsProvider ?? DEFAULT_METADATA_PREFERENCES.defaultLyricsProvider
    };
  }

  public clearCache(): void {
    this.cachedPreferences = null;
  }
}
