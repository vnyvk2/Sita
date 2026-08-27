import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  DEFAULT_METADATA_PREFERENCES,
  DEFAULT_SEARCH_RANKING_WEIGHTS
} from '../../../../common/metadata/preferences';
import { MetadataPreferencesService } from '../MetadataPreferencesService';

vi.mock('../../../db/queries/settings', () => ({
  getUserSettings: vi.fn(),
  saveUserSettings: vi.fn()
}));

import { getUserSettings, saveUserSettings } from '../../../db/queries/settings';

describe('MetadataPreferencesService', () => {
  let service: MetadataPreferencesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetadataPreferencesService();
  });

  it('returns default preferences when database settings are missing or throw', async () => {
    vi.mocked(getUserSettings).mockRejectedValueOnce(new Error('DB not found'));
    const prefs = await service.getPreferences();
    expect(prefs).toEqual({
      ...DEFAULT_METADATA_PREFERENCES,
      searchRankingWeights: DEFAULT_SEARCH_RANKING_WEIGHTS
    });
  });

  it('returns stored preferences when valid settings exist', async () => {
    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['discogs', 'musicbrainz'],
        defaultArtworkProvider: 'coverartarchive',
        defaultGenreProvider: 'discogs',
        defaultLyricsProvider: 'lrclib'
      }
    } as any);

    const prefs = await service.getPreferences();
    expect(prefs.enabledSearchProviders).toEqual(['musicbrainz', 'discogs']);
    expect(prefs.searchProviderPriority).toEqual(['discogs', 'musicbrainz']);
  });

  it('validates and saves valid preferences', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);
    vi.mocked(saveUserSettings).mockResolvedValueOnce(undefined as any);

    const saved = await service.savePreferences(
      {
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'discogs']
      },
      ['musicbrainz', 'discogs', 'spotify']
    );

    expect(saved.enabledSearchProviders).toEqual(['musicbrainz', 'discogs']);
    expect(saved.searchProviderPriority).toEqual(['musicbrainz', 'discogs']);
    expect(saveUserSettings).toHaveBeenCalledWith({
      metadataPreferences: expect.objectContaining({
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'discogs']
      })
    });
  });

  it('throws error when enabled search providers array is empty', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(service.savePreferences({ enabledSearchProviders: [] })).rejects.toThrow(
      /at least one valid provider/
    );
  });

  it('throws error when priority contains duplicates', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        enabledSearchProviders: ['musicbrainz', 'discogs'],
        searchProviderPriority: ['musicbrainz', 'musicbrainz'] as any
      })
    ).rejects.toThrow(/without duplicates/);
  });

  it('throws error when priority item is not in enabled search providers', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        enabledSearchProviders: ['musicbrainz'],
        searchProviderPriority: ['discogs']
      })
    ).rejects.toThrow(/must be one of the enabled search providers/);
  });

  it('sanitizes and repairs corrupted or stale persisted preferences on read', async () => {
    const dynamicService = new MetadataPreferencesService({
      getRegisteredSearchProviders: () => ['musicbrainz', 'discogs']
    });

    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        enabledSearchProviders: ['stale_removed_provider'],
        searchProviderPriority: ['stale_removed_provider']
      }
    } as any);

    const prefs = await dynamicService.getPreferences();
    // Non-existent provider filtered out; fallback to registered musicbrainz
    expect(prefs.enabledSearchProviders).toEqual(['musicbrainz']);
    expect(prefs.searchProviderPriority).toEqual(['musicbrainz']);
  });

  it('persists custom ranking weights within the allowed range', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);
    vi.mocked(saveUserSettings).mockResolvedValueOnce(undefined as any);

    const saved = await service.savePreferences({
      searchRankingWeights: {
        ...DEFAULT_SEARCH_RANKING_WEIGHTS,
        bootlegPenalty: -40,
        trackCountMatch: 25
      }
    });

    expect(saved.searchRankingWeights?.bootlegPenalty).toBe(-40);
    expect(saved.searchRankingWeights?.trackCountMatch).toBe(25);
    expect(saved.searchRankingWeights?.artistMatch).toBe(
      DEFAULT_SEARCH_RANKING_WEIGHTS.artistMatch
    );
  });

  it('throws when a ranking weight is outside the allowed range', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        searchRankingWeights: { ...DEFAULT_SEARCH_RANKING_WEIGHTS, titleMatch: 999 }
      })
    ).rejects.toThrow(/between -100 and 200/);
  });

  it('throws when a ranking weight is not a finite number', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        searchRankingWeights: { ...DEFAULT_SEARCH_RANKING_WEIGHTS, artistMatch: Number.NaN }
      })
    ).rejects.toThrow(/finite number/);
  });

  it('throws when a ranking weight is not an integer', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({
        searchRankingWeights: { ...DEFAULT_SEARCH_RANKING_WEIGHTS, trackCountMatch: 25.5 }
      })
    ).rejects.toThrow(/must be an integer/);
  });

  it('tolerates unknown ranking weight keys by dropping them during sanitization', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);
    vi.mocked(saveUserSettings).mockResolvedValueOnce(undefined as any);

    const junk = { ...DEFAULT_SEARCH_RANKING_WEIGHTS, futureWeightKey: 42 } as any;
    const saved = await service.savePreferences({ searchRankingWeights: junk });

    expect((saved.searchRankingWeights as unknown as Record<string, unknown>).futureWeightKey).toBeUndefined();
    expect(saved.searchRankingWeights?.artistMatch).toBe(
      DEFAULT_SEARCH_RANKING_WEIGHTS.artistMatch
    );
  });

  it('rounds floating-point persisted weights to integers on read', async () => {
    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        enabledSearchProviders: ['musicbrainz'],
        searchProviderPriority: ['musicbrainz'],
        searchRankingWeights: { artistMatch: 10.7 }
      }
    } as any);

    const prefs = await service.getPreferences();
    expect(prefs.searchRankingWeights?.artistMatch).toBe(11);
  });

  it('repairs invalid persisted ranking weights by falling back per key on read', async () => {
    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        enabledSearchProviders: ['musicbrainz'],
        searchProviderPriority: ['musicbrainz'],
        searchRankingWeights: { titleMatch: 500, artistMatch: 10 }
      }
    } as any);

    const prefs = await service.getPreferences();
    expect(prefs.searchRankingWeights?.titleMatch).toBe(DEFAULT_SEARCH_RANKING_WEIGHTS.titleMatch);
    expect(prefs.searchRankingWeights?.artistMatch).toBe(10);
  });

  it('throws when saving an unknown enrichment provider', async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      metadataPreferences: DEFAULT_METADATA_PREFERENCES
    } as any);

    await expect(
      service.savePreferences({ defaultGenreProvider: 'spotify' as any })
    ).rejects.toThrow(/not a known enrichment source/);
  });

  it('falls back to defaults when persisted enrichment providers are invalid on read', async () => {
    vi.mocked(getUserSettings).mockResolvedValueOnce({
      metadataPreferences: {
        ...DEFAULT_METADATA_PREFERENCES,
        defaultGenreProvider: 'spotify',
        defaultArtworkProvider: 'discogs'
      }
    } as any);

    const prefs = await service.getPreferences();
    expect(prefs.defaultGenreProvider).toBe(DEFAULT_METADATA_PREFERENCES.defaultGenreProvider);
    expect(prefs.defaultArtworkProvider).toBe(DEFAULT_METADATA_PREFERENCES.defaultArtworkProvider);
  });
});
